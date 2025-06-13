import React, { useState } from 'react';
import { notesApi } from '../api';
import { Note } from '../types';

interface NoteEditorProps {
  onNoteCreated: (note: Note) => void;
}

const NoteEditor: React.FC<NoteEditorProps> = ({ onNoteCreated }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setIsLoading(true);
    try {
      const newNote = await notesApi.createNote(title, content);
      onNoteCreated(newNote);
      setTitle('');
      setContent('');
    } catch (error) {
      console.error('Error creating note:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="note-editor">
      <h2>✨ Create New Note</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <input
            type="text"
            placeholder="✏️ Note title..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isLoading}
          />
        </div>
        <div className="form-group">
          <textarea
            placeholder="📝 Write your note here..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={6}
            disabled={isLoading}
          />
        </div>
        <button type="submit" disabled={isLoading || !title.trim() || !content.trim()}>
          {isLoading ? '⏳ Creating...' : '🚀 Create Note'}
        </button>
      </form>
    </div>
  );
};

export default NoteEditor;