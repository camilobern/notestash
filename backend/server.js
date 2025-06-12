const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const OpenAI = require('openai');
const { ChromaClient } = require('chromadb');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const chroma = new ChromaClient();

// Custom embedding function that does nothing (we handle embeddings with OpenAI)
class NoOpEmbeddingFunction {
  constructor() {
    this.name = "NoOpEmbeddingFunction";
  }
  
  async generate(texts) {
    // Return empty embeddings since we provide them manually
    return texts.map(() => new Array(1536).fill(0)); // text-embedding-3-small has 1536 dimensions
  }
}

const db = new sqlite3.Database('./notes.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS note_tags (
    note_id TEXT,
    tag_id TEXT,
    confidence REAL DEFAULT 1.0,
    FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS tag_relationships (
    tag1_id TEXT,
    tag2_id TEXT,
    similarity REAL,
    FOREIGN KEY (tag1_id) REFERENCES tags (id) ON DELETE CASCADE,
    FOREIGN KEY (tag2_id) REFERENCES tags (id) ON DELETE CASCADE,
    PRIMARY KEY (tag1_id, tag2_id)
  )`);
});

async function generateTags(content) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that generates relevant tags for notes. Return only a JSON array of strings representing tags, no other text."
        },
        {
          role: "user",
          content: `Generate 3-7 relevant tags for this note content: ${content}`
        }
      ],
      max_tokens: 150,
      temperature: 0.7
    });

    const tags = JSON.parse(response.choices[0].message.content);
    return Array.isArray(tags) ? tags : [];
  } catch (error) {
    console.error('Error generating tags:', error);
    return [];
  }
}

async function calculateTagSimilarity(tag1, tag2) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "Rate the conceptual similarity between two tags on a scale of 0.0 to 1.0. Return only the number, no other text."
        },
        {
          role: "user",
          content: `Rate similarity between "${tag1}" and "${tag2}"`
        }
      ],
      max_tokens: 10,
      temperature: 0.1
    });

    const similarity = parseFloat(response.choices[0].message.content.trim());
    return isNaN(similarity) ? 0 : Math.max(0, Math.min(1, similarity));
  } catch (error) {
    console.error('Error calculating similarity:', error);
    return 0;
  }
}

// Vector-based similarity calculation using Chroma
async function calculateAllTagSimilarities(tags) {
  try {
    // Get or create collection
    let collection;
    try {
      collection = await chroma.getCollection({ name: "tag-embeddings" });
      // Clear existing data by deleting and recreating
      await chroma.deleteCollection({ name: "tag-embeddings" });
    } catch (error) {
      // Collection doesn't exist, which is fine
    }
    
    collection = await chroma.createCollection({ 
      name: "tag-embeddings",
      embeddingFunction: new NoOpEmbeddingFunction()
    });

    // Generate embeddings for all tags
    const tagTexts = tags.map(tag => tag.name);
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: tagTexts,
    });

    const embeddings = response.data.map(item => item.embedding);
    const ids = tags.map(tag => tag.id);

    // Store embeddings in Chroma
    await collection.add({
      ids: ids,
      embeddings: embeddings,
      metadatas: tags.map(tag => ({ name: tag.name })),
      documents: tagTexts
    });

    // Use Chroma's built-in similarity search
    const relationships = [];
    
    for (const tag of tags) {
      const results = await collection.query({
        queryEmbeddings: [embeddings[tags.findIndex(t => t.id === tag.id)]],
        nResults: tags.length - 1, // Get all other tags
        include: ['distances', 'metadatas']
      });

      // Convert distances to similarities and filter
      results.distances[0].forEach((distance, index) => {
        const similarity = 1 - distance; // Convert distance to similarity
        const otherTagId = results.ids[0][index];
        
        if (similarity > 0.3 && tag.id < otherTagId) { // Avoid duplicates
          relationships.push({
            tag1_id: tag.id,
            tag2_id: otherTagId,
            similarity: similarity
          });
        }
      });
    }

    return relationships;
  } catch (error) {
    console.error('Error calculating vector similarity:', error);
    return [];
  }
}

app.get('/api/notes', (req, res) => {
  db.all(`
    SELECT n.*, GROUP_CONCAT(t.name) as tags
    FROM notes n
    LEFT JOIN note_tags nt ON n.id = nt.note_id
    LEFT JOIN tags t ON nt.tag_id = t.id
    GROUP BY n.id
    ORDER BY n.updated_at DESC
  `, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    const notes = rows.map(row => ({
      ...row,
      tags: row.tags ? row.tags.split(',') : []
    }));
    
    res.json(notes);
  });
});

app.post('/api/notes', async (req, res) => {
  const { title, content } = req.body;
  const noteId = uuidv4();
  
  try {
    const generatedTags = await generateTags(content);
    
    db.run('INSERT INTO notes (id, title, content) VALUES (?, ?, ?)', 
      [noteId, title, content], function(err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      const tagPromises = generatedTags.map(tagName => {
        return new Promise((resolve, reject) => {
          const tagId = uuidv4();
          
          db.run('INSERT OR IGNORE INTO tags (id, name) VALUES (?, ?)', 
            [tagId, tagName], function(tagErr) {
            if (tagErr) {
              reject(tagErr);
              return;
            }
            
            db.get('SELECT id FROM tags WHERE name = ?', [tagName], (getErr, row) => {
              if (getErr) {
                reject(getErr);
                return;
              }
              
              const finalTagId = row.id;
              db.run('INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)', 
                [noteId, finalTagId], (linkErr) => {
                if (linkErr) {
                  reject(linkErr);
                  return;
                }
                resolve(finalTagId);
              });
            });
          });
        });
      });
      
      Promise.all(tagPromises).then(() => {
        res.json({ id: noteId, title, content, tags: generatedTags });
      }).catch(tagError => {
        console.error('Error adding tags:', tagError);
        res.json({ id: noteId, title, content, tags: [] });
      });
    });
  } catch (error) {
    console.error('Error creating note:', error);
    res.status(500).json({ error: 'Failed to create note' });
  }
});

app.get('/api/tags/relationships', (req, res) => {
  db.all(`
    SELECT t1.name as tag1, t2.name as tag2, tr.similarity
    FROM tag_relationships tr
    JOIN tags t1 ON tr.tag1_id = t1.id
    JOIN tags t2 ON tr.tag2_id = t2.id
    WHERE tr.similarity > 0.3
    ORDER BY tr.similarity DESC
  `, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// New fast vector-based endpoint
app.post('/api/tags/calculate-relationships-fast', async (req, res) => {
  try {
    db.all('SELECT * FROM tags', async (err, tags) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      if (tags.length === 0) {
        res.json({ message: 'No tags found', count: 0 });
        return;
      }

      console.log(`Calculating relationships for ${tags.length} tags using vector embeddings`);
      const relationships = await calculateAllTagSimilarities(tags);
      
      // Insert all relationships
      const insertPromises = relationships.map(rel => {
        return new Promise((resolve, reject) => {
          db.run(
            'INSERT OR REPLACE INTO tag_relationships (tag1_id, tag2_id, similarity) VALUES (?, ?, ?)',
            [rel.tag1_id, rel.tag2_id, rel.similarity],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      });
      
      await Promise.all(insertPromises);
      res.json({ message: 'Relationships calculated successfully', count: relationships.length });
    });
  } catch (error) {
    console.error('Error calculating relationships:', error);
    res.status(500).json({ error: 'Failed to calculate relationships' });
  }
});

// Original slower endpoint (kept for comparison)
app.post('/api/tags/calculate-relationships', async (req, res) => {
  try {
    db.all('SELECT * FROM tags', async (err, tags) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      // Limit processing to avoid excessive API calls
      if (tags.length > 50) {
        res.status(400).json({ error: 'Too many tags. Limit to 50 tags to avoid timeout.' });
        return;
      }
      
      const relationships = [];
      const batchSize = 5; // Process 5 comparisons at a time
      
      // Create all tag pairs
      const tagPairs = [];
      for (let i = 0; i < tags.length; i++) {
        for (let j = i + 1; j < tags.length; j++) {
          tagPairs.push([tags[i], tags[j]]);
        }
      }
      
      console.log(`Processing ${tagPairs.length} tag pairs in batches of ${batchSize}`);
      
      // Process in batches to avoid rate limits
      for (let i = 0; i < tagPairs.length; i += batchSize) {
        const batch = tagPairs.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async ([tag1, tag2]) => {
          try {
            // Add small delay between requests
            await new Promise(resolve => setTimeout(resolve, 100));
            const similarity = await calculateTagSimilarity(tag1.name, tag2.name);
            
            if (similarity > 0.1) {
              return {
                tag1_id: tag1.id,
                tag2_id: tag2.id,
                similarity: similarity
              };
            }
            return null;
          } catch (error) {
            console.error(`Error comparing ${tag1.name} and ${tag2.name}:`, error);
            return null;
          }
        });
        
        const batchResults = await Promise.all(batchPromises);
        relationships.push(...batchResults.filter(rel => rel !== null));
        
        console.log(`Processed batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(tagPairs.length/batchSize)}`);
      }
      
      // Insert all relationships
      const insertPromises = relationships.map(rel => {
        return new Promise((resolve, reject) => {
          db.run(
            'INSERT OR REPLACE INTO tag_relationships (tag1_id, tag2_id, similarity) VALUES (?, ?, ?)',
            [rel.tag1_id, rel.tag2_id, rel.similarity],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      });
      
      await Promise.all(insertPromises);
      res.json({ message: 'Relationships calculated successfully', count: relationships.length });
    });
  } catch (error) {
    console.error('Error calculating relationships:', error);
    res.status(500).json({ error: 'Failed to calculate relationships' });
  }
});

// Search endpoint using embeddings
app.post('/api/notes/search', async (req, res) => {
  const { query } = req.body;
  
  if (!query || query.trim() === '') {
    res.status(400).json({ error: 'Query is required' });
    return;
  }

  try {
    // Get all notes from database
    db.all(`
      SELECT n.*, GROUP_CONCAT(t.name) as tags
      FROM notes n
      LEFT JOIN note_tags nt ON n.id = nt.note_id
      LEFT JOIN tags t ON nt.tag_id = t.id
      GROUP BY n.id
      ORDER BY n.updated_at DESC
    `, async (err, notes) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }

      if (notes.length === 0) {
        res.json([]);
        return;
      }

      try {
        // Get or create collection for notes
        let collection;
        try {
          collection = await chroma.getCollection({ name: "note-embeddings", embeddingFunction: new NoOpEmbeddingFunction() });
          await chroma.deleteCollection({ name: "note-embeddings" });
        } catch (error) {
          // Collection doesn't exist, which is fine
        }
        collection = await chroma.createCollection({ name: "note-embeddings", embeddingFunction: new NoOpEmbeddingFunction() });

        // Prepare note content for embedding (title + content + tags)
        const noteTexts = notes.map(note => {
          const tags = note.tags ? note.tags.split(',').join(' ') : '';
          return `${note.title} ${note.content} ${tags}`;
        });


        // Generate embeddings for all notes and the query
        const allTexts = [...noteTexts, query];
        const response = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: allTexts,
        });

        const noteEmbeddings = response.data.slice(0, -1).map(item => item.embedding);
        const queryEmbedding = response.data[response.data.length - 1].embedding;


        // Store note embeddings in Chroma
        await collection.add({
          ids: notes.map(note => note.id),
          embeddings: noteEmbeddings,
          metadatas: notes.map(note => ({ 
            title: note.title,
            tags: note.tags || ''
          })),
          documents: noteTexts
        });

        // Search for similar notes
        const results = await collection.query({
          queryEmbeddings: [queryEmbedding],
          nResults: Math.min(10, notes.length), // Return top 10 results
          include: ['distances', 'metadatas', 'documents']
        });


        // Format results with similarity scores
        const searchResults = results.ids[0].map((noteId, index) => {
          const note = notes.find(n => n.id === noteId);
          const maxDistance = 2; // adjust based on observed range
          const similarity = 1 - (results.distances[0][index] / maxDistance);          
          
          return {
            ...note,
            tags: note.tags ? note.tags.split(',') : [],
            similarity: similarity
          };
        }).filter(result => result.similarity > 0.2)
         .sort((a, b) => b.similarity - a.similarity); // Sort by similarity descending



        res.json(searchResults);
      } catch (embeddingError) {
        console.error('Error with embeddings:', embeddingError);
        res.status(500).json({ error: 'Failed to perform semantic search' });
      }
    });
  } catch (error) {
    console.error('Error searching notes:', error);
    res.status(500).json({ error: 'Failed to search notes' });
  }
});

app.get('/api/notes/by-tag/:tagName', (req, res) => {
  const { tagName } = req.params;
  db.get('SELECT id FROM tags WHERE name = ?', [tagName], (err, tagRow) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!tagRow) {
      res.json([]);
      return;
    }
    const tagId = tagRow.id;
    db.all(`
      SELECT n.*, GROUP_CONCAT(t.name) as tags
      FROM notes n
      LEFT JOIN note_tags nt ON n.id = nt.note_id
      LEFT JOIN tags t ON nt.tag_id = t.id
      WHERE n.id IN (SELECT note_id FROM note_tags WHERE tag_id = ?)
      GROUP BY n.id
      ORDER BY n.updated_at DESC
    `, [tagId], (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      const notes = rows.map(row => ({
        ...row,
        tags: row.tags ? row.tags.split(',') : []
      }));
      res.json(notes);
    });
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});