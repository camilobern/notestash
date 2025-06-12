import axios from 'axios';
import { Note, TagRelationship, SearchResult } from './types';

const API_BASE_URL = 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
});

export const notesApi = {
  getAllNotes: async (): Promise<Note[]> => {
    const response = await api.get('/notes');
    return response.data;
  },

  createNote: async (title: string, content: string): Promise<Note> => {
    const response = await api.post('/notes', { title, content });
    return response.data;
  },

  searchNotes: async (query: string): Promise<SearchResult[]> => {
    const response = await api.post('/notes/search', { query });
    return response.data;
  },
};

export const tagsApi = {
  getTagRelationships: async (): Promise<TagRelationship[]> => {
    const response = await api.get('/tags/relationships');
    return response.data;
  },

  calculateRelationships: async (): Promise<void> => {
    await api.post('/tags/calculate-relationships');
  },

  calculateRelationshipsFast: async (): Promise<void> => {
    await api.post('/tags/calculate-relationships-fast');
  },
};