export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  name: string;
  created_at: string;
}

export interface TagRelationship {
  tag1: string;
  tag2: string;
  similarity: number;
}

export interface SearchResult extends Note {
  similarity: number;
}