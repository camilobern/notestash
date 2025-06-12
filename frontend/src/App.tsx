import React, { useState, useEffect } from 'react';
import './App.css';
import { Note, TagRelationship, SearchResult } from './types';
import { notesApi, tagsApi } from './api';
import NoteEditor from './components/NoteEditor';
import NoteList from './components/NoteList';
import TagVisualization from './components/TagVisualization';
import SearchResults from './components/SearchResults';

function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [tagRelationships, setTagRelationships] = useState<TagRelationship[]>([]);
  const [activeTab, setActiveTab] = useState<'notes' | 'search' | 'visualization' | 'visualization-fast'>('notes');
  const [isLoadingRelationships, setIsLoadingRelationships] = useState(false);
  const [isLoadingRelationshipsFast, setIsLoadingRelationshipsFast] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    loadNotes();
    loadTagRelationships();
  }, []);

  const loadNotes = async () => {
    try {
      const fetchedNotes = await notesApi.getAllNotes();
      setNotes(fetchedNotes);
    } catch (error) {
      console.error('Error loading notes:', error);
    }
  };

  const loadTagRelationships = async () => {
    try {
      const relationships = await tagsApi.getTagRelationships();
      setTagRelationships(relationships);
    } catch (error) {
      console.error('Error loading tag relationships:', error);
    }
  };

  const handleNoteCreated = (newNote: Note) => {
    setNotes(prev => [newNote, ...prev]);
  };

  const handleCalculateRelationships = async () => {
    setIsLoadingRelationships(true);
    try {
      await tagsApi.calculateRelationships();
      await loadTagRelationships();
    } catch (error) {
      console.error('Error calculating relationships:', error);
    } finally {
      setIsLoadingRelationships(false);
    }
  };

  const handleCalculateRelationshipsFast = async () => {
    setIsLoadingRelationshipsFast(true);
    try {
      await tagsApi.calculateRelationshipsFast();
      await loadTagRelationships();
    } catch (error) {
      console.error('Error calculating relationships (fast):', error);
    } finally {
      setIsLoadingRelationshipsFast(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const results = await notesApi.searchNotes(searchQuery);
      setSearchResults(results);
    } catch (error) {
      console.error('Error searching notes:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="App">
      <header className="app-header">
        <h1>Note Stash</h1>
        <nav className="tabs">
          <button 
            className={activeTab === 'notes' ? 'active' : ''}
            onClick={() => setActiveTab('notes')}
          >
            Notes
          </button>
          <button 
            className={activeTab === 'search' ? 'active' : ''}
            onClick={() => setActiveTab('search')}
          >
            Search
          </button>
          <button 
            className={activeTab === 'visualization' ? 'active' : ''}
            onClick={() => setActiveTab('visualization')}
          >
            Tag Visualization
          </button>
          <button 
            className={activeTab === 'visualization-fast' ? 'active' : ''}
            onClick={() => setActiveTab('visualization-fast')}
          >
            Tag Visualization (Fast)
          </button>
        </nav>
      </header>

      <main className="app-main">
        {activeTab === 'notes' ? (
          <div className="notes-section">
            <NoteEditor onNoteCreated={handleNoteCreated} />
            <NoteList notes={notes} />
          </div>
        ) : activeTab === 'search' ? (
          <div className="search-section">
            <form onSubmit={handleSearch} className="search-form">
              <div className="search-input-group">
                <input
                  type="text"
                  placeholder="Search your notes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                />
                <button 
                  type="submit" 
                  disabled={isSearching || !searchQuery.trim()}
                  className="search-button"
                >
                  {isSearching ? 'Searching...' : 'Search'}
                </button>
              </div>
            </form>
            <SearchResults results={searchResults} isLoading={isSearching} />
          </div>
        ) : activeTab === 'visualization' ? (
          <div className="visualization-section">
            <div className="visualization-controls">
              <button 
                onClick={handleCalculateRelationships}
                disabled={isLoadingRelationships}
              >
                {isLoadingRelationships ? 'Calculating...' : 'Calculate Tag Relationships (Slow)'}
              </button>
            </div>
            <TagVisualization relationships={tagRelationships} />
          </div>
        ) : (
          <div className="visualization-section">
            <div className="visualization-controls">
              <button 
                onClick={handleCalculateRelationshipsFast}
                disabled={isLoadingRelationshipsFast}
              >
                {isLoadingRelationshipsFast ? 'Calculating...' : 'Calculate Tag Relationships (Fast)'}
              </button>
            </div>
            <TagVisualization relationships={tagRelationships} />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
