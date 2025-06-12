import React from 'react';
import { Note } from '../types';

interface NoteListProps {
  notes: Note[];
}

const NoteList: React.FC<NoteListProps> = ({ notes }) => {
  return (
    <div className="note-list">
      <h2>Your Notes</h2>
      {notes.length === 0 ? (
        <p>No notes yet. Create your first note!</p>
      ) : (
        <div className="notes-grid">
          {notes.map((note) => (
            <div key={note.id} className="note-card">
              <h3>{note.title}</h3>
              <p className="note-content">{note.content}</p>
              <div className="note-tags">
                {note.tags.map((tag, index) => (
                  <span key={index} className="tag">
                    {tag}
                  </span>
                ))}
              </div>
              <div className="note-meta">
                <small>
                  Created: {new Date(note.created_at).toLocaleDateString()}
                </small>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default NoteList;