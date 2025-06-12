const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

app.post('/api/tags/calculate-relationships', async (req, res) => {
  try {
    db.all('SELECT * FROM tags', async (err, tags) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      const relationships = [];
      
      for (let i = 0; i < tags.length; i++) {
        for (let j = i + 1; j < tags.length; j++) {
          const similarity = await calculateTagSimilarity(tags[i].name, tags[j].name);
          
          if (similarity > 0.1) {
            relationships.push({
              tag1_id: tags[i].id,
              tag2_id: tags[j].id,
              similarity: similarity
            });
          }
        }
      }
      
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});