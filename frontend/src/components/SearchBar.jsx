import { useState } from 'react';

const SearchBar = ({ data, onSelect }) => {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);

  const handleSearch = (e) => {
    const value = e.target.value;
    setQuery(value);
    
    if (value.length > 0) {
      const q = value.toLowerCase();
      const filtered = data.nodes.filter(node => 
        node.name.toLowerCase().includes(q) || 
        node.artist.toLowerCase().includes(q) ||
        (node.album && node.album.toLowerCase().includes(q))
      );
      setSuggestions(filtered);
    } else {
      setSuggestions([]);
    }
  };

  return (
    <div className="absolute top-5 left-5 z-10">
      <input 
        type="text" 
        name="search-query"
        id="search-query"
        placeholder="Search songs, artists, albums..." 
        value={query}
        onChange={handleSearch}
        className="w-[300px] bg-black/80 border border-white/10 text-white px-5 py-3 rounded-full backdrop-blur-md outline-none focus:border-white/30 shadow-2xl transition-all"
      />
      
      {suggestions.length > 0 && (
        <ul className="mt-2 bg-black/90 border border-white/10 rounded-xl overflow-hidden backdrop-blur-xl max-h-[250px] overflow-y-auto">
          {suggestions.map(node => (
            <li 
              key={node.id} 
              onClick={() => { onSelect(node); setQuery(""); setSuggestions([]); }}
              className="px-4 py-3 hover:bg-white/10 cursor-pointer flex items-center gap-3 border-b border-white/5 last:border-0"
            >
              <img src={node.img} alt="" className="w-8 h-8 rounded object-cover"/>
              <div className="min-w-0">
                <div className="text-white text-sm font-medium truncate">{node.name}</div>
                <div className="text-white/40 text-xs truncate">{node.artist}{node.album && ` • ${node.album}`}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SearchBar;