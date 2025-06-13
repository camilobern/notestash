import React from 'react';
import { Note } from '../types';

interface NoteListProps {
  notes: Note[];
}

const NoteList: React.FC<NoteListProps> = ({ notes }) => {
  return (
    <div className="note-list">
      <h2>📚 Your Notes</h2>
      {notes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📝</div>
          <p>No notes yet. Create your first note!</p>
        </div>
      ) : (
        <div className="notes-grid">
          {notes.map((note, index) => (
            <div key={note.id} className="note-card" style={{animationDelay: `${index * 0.1}s`}}>
              <h3>{note.title}</h3>
              <p className="note-content">{note.content}</p>
              <div className="note-tags">
                {note.tags.map((tag, index) => (
                  <span key={index} className="tag">
                    #{tag}
                  </span>
                ))}
              </div>
              <div className="note-meta">
                <small>
                  📅 {new Date(note.created_at).toLocaleDateString()}
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