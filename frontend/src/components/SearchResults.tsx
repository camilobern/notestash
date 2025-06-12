import React from 'react';
import { SearchResult } from '../types';

interface SearchResultsProps {
  results: SearchResult[];
  isLoading: boolean;
}

const SearchResults: React.FC<SearchResultsProps> = ({ results, isLoading }) => {
  if (isLoading) {
    return <div className="search-loading">Searching...</div>;
  }

  if (results.length === 0) {
    return <div className="no-results">No results found. Try a different search query.</div>;
  }

  return (
    <div className="search-results">
      <h3>Search Results ({results.length})</h3>
      {results.map((result) => (
        <div key={result.id} className="search-result-item">
          <div className="search-result-header">
            <h4 className="search-result-title">{result.title}</h4>
            <span className="similarity-score">
              {Math.round(result.similarity * 100)}% match
            </span>
          </div>
          <div className="search-result-content">
            {result.content.length > 200 
              ? `${result.content.substring(0, 200)}...` 
              : result.content
            }
          </div>
          {result.tags && result.tags.length > 0 && (
            <div className="search-result-tags">
              {result.tags.map((tag, index) => (
                <span key={index} className="tag">
                  {tag}
                </span>
              ))}
            </div>
          )}
          <div className="search-result-meta">
            Created: {new Date(result.created_at).toLocaleDateString()}
          </div>
        </div>
      ))}
    </div>
  );
};

export default SearchResults;