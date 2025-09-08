import React from 'react';
import { ChevronDown, Star } from 'lucide-react';

type SortOption = 'ai_score' | 'price' | 'star';

interface SortByProps {
  value: SortOption;
  onChange: (value: SortOption, starRating?: number) => void;
}

const SortBy: React.FC<SortByProps> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [showStarOptions, setShowStarOptions] = React.useState(false);

  const options = [
    { value: 'ai_score', label: 'AI Score' },
    { value: 'price', label: 'Price (Low to High)' },
    { value: 'star', label: 'Hotel Star Rating' }
  ];

  const handleOptionSelect = (optionValue: SortOption) => {
    if (optionValue === 'star') {
      setShowStarOptions(true);
    } else {
      onChange(optionValue);
      setIsOpen(false);
      setShowStarOptions(false);
    }
  };

  const handleStarRatingSelect = (rating: number) => {
    onChange('star', rating);
    setShowStarOptions(false);
    setIsOpen(false);
  };

  const renderStarRatingOptions = () => {
    return (
      <div className="absolute top-0 left-full ml-1 w-48 bg-white rounded-lg shadow-lg py-2 z-50">
        {[1, 2, 3, 4, 5].map((rating) => (
          <button
            key={rating}
            className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center gap-2"
            onClick={() => handleStarRatingSelect(rating)}
          >
            <span className="flex items-center">
              {Array.from({ length: rating }).map((_, i) => (
                <Star key={i} className="w-4 h-4 text-yellow-400 fill-current" />
              ))}
            </span>
            <span>{rating} Star Hotels</span>
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white shadow-sm hover:shadow-md transition-shadow"
      >
        <span>Sort by: {options.find(opt => opt.value === value)?.label}</span>
        <ChevronDown className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg shadow-lg py-2 z-50">
          {options.map((option) => (
            <button
              key={option.value}
              className="w-full px-4 py-2 text-left hover:bg-gray-100"
              onClick={() => handleOptionSelect(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {showStarOptions && renderStarRatingOptions()}
    </div>
  );
};

export default SortBy;