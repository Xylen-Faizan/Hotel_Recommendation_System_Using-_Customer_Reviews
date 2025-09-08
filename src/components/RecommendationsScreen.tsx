import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Filter, MapPin, Star, Users, Briefcase, Heart, User, Search as SearchIcon } from 'lucide-react';
import { RecommendedHotel, TravelerPersona } from '../types/hotel';
import { HotelCard } from './HotelCard';
import { InteractiveMap } from './InteractiveMap';
import { AIInsights } from './AIInsights';
import { PriceFilter } from './PriceFilter';
import type { PriceRange } from '../utils/priceUtils';
import Chatbot from './Chatbot';
import SortBy from './SortBy';
import { geocodeNominatim, getCloseMatches, haversineDistance } from '../utils/geo';

interface RecommendationsScreenProps {
  hotels: RecommendedHotel[];
  persona: TravelerPersona;
  selectedCity: string;
  onBack: () => void;
}

const RecommendationsScreen: React.FC<RecommendationsScreenProps> = ({
  hotels,
  persona,
  selectedCity,
  onBack
}) => {
  const [sortBy, setSortBy] = useState<'ai_score' | 'price' | 'star'>('ai_score');
  const [starRatingFilter, setStarRatingFilter] = useState<number | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [selectedPriceRange, setSelectedPriceRange] = useState<PriceRange | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [areaQuery, setAreaQuery] = useState('');
  const [areaInput, setAreaInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [geoCenter, setGeoCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [distanceByKey, setDistanceByKey] = useState<Record<string, number>>({});
  const [areaFiltered, setAreaFiltered] = useState<RecommendedHotel[] | null>(null);
  const [filteredHotelsByApi, setFilteredHotelsByApi] = useState<RecommendedHotel[] | null>(null);
  const [addressFilter, setAddressFilter] = useState('');
  const [priceFilter, setPriceFilter] = useState<number | null>(null);
  const [averageRatingFilter, setAverageRatingFilter] = useState<number | null>(null);

  // Parse reviews for hotels
  const hotelsWithParsedReviews = useMemo(() => {
    return hotels.map(hotel => {
      console.log('Processing hotel:', hotel.name);
      console.log('Raw platform_ratings:', hotel.platform_ratings);
      
      // Ensure platform_ratings is properly formatted
      const platformRatings = hotel.platform_ratings || {};
      const formattedRatings: Record<string, { rating: number; reviews_count: number }> = {};
      
      Object.entries(platformRatings).forEach(([platform, data]: [string, any]) => {
        if (data && typeof data === 'object') {
          formattedRatings[platform] = {
            rating: Number(data.rating) || 0,
            reviews_count: Number(data.reviews_count) || 0
          };
        }
      });
      
      return {
        ...hotel,
        platform_ratings: formattedRatings
      };
    });
  }, [hotels]);

  // Filter and sort hotels by selected criteria
  const filteredHotels = useMemo(() => {
    console.log('Original hotels:', hotelsWithParsedReviews);
    let filtered = [...hotelsWithParsedReviews]; // Use the hotels with parsed reviews

    // Filter by city if selected
    if (selectedCity && selectedCity !== 'all') {
      const cityLower = selectedCity.toLowerCase();
      filtered = filtered.filter(hotel => {
        const matches = hotel.city.toLowerCase() === cityLower;
        if (!matches) {
          console.log(`Filtered out hotel ${hotel.name} (${hotel.city}) - city doesn't match ${selectedCity}`);
        }
        return matches;
      });
    }

    // Sort hotels based on selected criteria and return top 5
    filtered = filtered.sort((a, b) => {
      switch (sortBy) {
        case 'ai_score':
          return (b.overall_score || 0) - (a.overall_score || 0);
        case 'price':
          return (a.price_range || 0) - (b.price_range || 0);
        case 'star':
          return (b.hotel_star_rating || 0) - (a.hotel_star_rating || 0);
        default:
          return 0;
      }
    }).slice(0, 5); // Only take top 5 hotels after sorting

    // Filter by price range
    if (selectedPriceRange) {
      filtered = filtered.filter(hotel => {
        const price = hotel.price_range || 2500;
        const inRange = price >= selectedPriceRange.min && price <= selectedPriceRange.max;
        if (!inRange) {
          console.log(`Filtered out hotel ${hotel.name} - price ${price} not in range [${selectedPriceRange.min}, ${selectedPriceRange.max}]`);
        }
        return inRange;
      });
    }

    // Ensure platform_ratings are correctly set with parsed reviews
    filtered = filtered.map(hotel => {
      // Start with existing platform_ratings or an empty object
      let platformRatings = hotel.platform_ratings || {};
      
      // Log the data for debugging
      console.log(`Processing hotel: ${hotel.name}`);
      console.log('Platform ratings:', platformRatings);

      // Ensure each platform rating has the correct structure
      const formattedRatings: Record<string, { rating: number; reviews_count: number }> = {};
      
      // Process each platform's ratings
      Object.entries(platformRatings).forEach(([platform, data]: [string, any]) => {
        if (data && typeof data === 'object') {
          formattedRatings[platform] = {
            rating: Number(data.rating) || 0,
            reviews_count: Number(data.reviews_count) || 0
          };
        }
      });
      
      console.log(`Formatted platform ratings for ${hotel.name}:`, formattedRatings);
      
      return {
        ...hotel,
        platform_ratings: formattedRatings
      };
    });

    console.log('Filtered hotels with parsed reviews:', filtered);
    return filtered;
  }, [hotels, selectedCity, selectedPriceRange]);

  const applyFilters = async () => {
    try {
      const response = await fetch('http://localhost:8000/filter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          hotels: filteredHotels.slice(0, 5), // Only send top 5 hotels for filtering
          address: addressFilter,
          price: priceFilter,
          hotel_star_rating: starRatingFilter,
          average_rating: averageRatingFilter,
        }),
      });
      const data = await response.json();
      // Ensure we only show top 5 filtered results
      setFilteredHotelsByApi(data.slice(0, 5));
    } catch (error) {
      console.error('Error filtering hotels:', error);
    }
  };

  // Area search: compute top-5 hotels using fuzzy match over address/city, otherwise geocode and distance
  useEffect(() => {
    let cancel = false;
    (async () => {
      setSearchError(null);
      setGeoCenter(null);
      setDistanceByKey({});
      if (!areaQuery.trim()) {
        setAreaFiltered(null);
        return;
      }
      
      console.log('Starting area search with query:', areaQuery);
      setSearching(true);
      try {
        // Fuzzy match within filteredHotels in the selected city
        const addressPool: string[] = [];
        const addressToHotelKey = new Map<string, string>();
        const keyToHotel = new Map<string, RecommendedHotel>();
        for (const h of filteredHotels) {
          const addr = h.address || '';
          const city = h.city || '';
          const combos = [addr, city].filter(Boolean);
          const key = `${h.name}__${h.city}`;
          keyToHotel.set(key, h);
          for (const c of combos) {
            addressPool.push(c);
            addressToHotelKey.set(c, key);
          }
        }

        console.log('Trying fuzzy match with address pool:', addressPool);
        const matches = getCloseMatches(areaQuery, addressPool, 10, 0.6);
        console.log('Fuzzy matches found:', matches);
        
        if (matches.length > 0) {
          const uniqKeys = Array.from(new Set(matches.map((m) => addressToHotelKey.get(m)).filter(Boolean))) as string[];
          console.log('Unique hotel keys from matches:', uniqKeys);
          
          const matchedHotels = uniqKeys
            .map((k) => keyToHotel.get(k as string))
            .filter((h): h is RecommendedHotel => h !== undefined)
            .slice(0, 5);
            
          console.log('Matched hotels after filtering:', matchedHotels);
          
          if (!cancel) {
            setAreaFiltered(matchedHotels);
            setSearching(false);
          }
          return;
        }

        // Geocode fallback
        const q = selectedCity && selectedCity !== 'all' ? `${areaQuery}, ${selectedCity}` : areaQuery;
        const center = await geocodeNominatim(q);
        if (!center) {
          if (!cancel) {
            setAreaFiltered(filteredHotels.slice(0, 5));
            setSearchError('No exact match found; showing top results.');
            setSearching(false);
          }
          return;
        }

        // Compute distances and pick nearest 5
        const distances: Record<string, number> = {};
        const withDist = filteredHotels
          .map((h) => {
            const key = `${h.name}-${h.city}`;
            const d = haversineDistance(center, { lat: h.coordinates.lat, lng: h.coordinates.lng });
            distances[key] = d;
            return { h, d };
          })
          .sort((a, b) => a.d - b.d)
          .slice(0, 5)
          .map((x) => x.h);

        if (!cancel) {
          setGeoCenter(center);
          setDistanceByKey(distances);
          setAreaFiltered(withDist);
          setSearching(false);
        }
      } catch (e) {
        if (!cancel) {
          setAreaFiltered(filteredHotels.slice(0, 5));
          setSearchError('Search failed; showing defaults.');
          setSearching(false);
        }
      }
    })();
    return () => { cancel = true; };
  }, [areaQuery, filteredHotels, selectedCity]);

  // Keep the input synced to the last executed query (useful after searches)
  useEffect(() => {
    setAreaInput(areaQuery);
  }, [areaQuery]);

  // Filter and sort hotels based on selected criteria
  const baseHotels = useMemo(() => {
    let hotels = filteredHotelsByApi ?? areaFiltered ?? filteredHotels;

    // Filter by star rating if selected
    if (sortBy === 'star' && starRatingFilter) {
      hotels = hotels.filter(hotel => hotel.hotel_star_rating === starRatingFilter);
    }

    // Sort hotels based on criteria
    return [...hotels].sort((a, b) => {
      switch (sortBy) {
        case 'ai_score':
          return (b.overall_score || 0) - (a.overall_score || 0);
        case 'price':
          return (a.price_range || 0) - (b.price_range || 0);
        case 'star':
          return (b.hotel_star_rating || 0) - (a.hotel_star_rating || 0);
        default:
          return 0;
      }
    });
  }, [filteredHotels, areaFiltered, filteredHotelsByApi, sortBy, starRatingFilter]);
  
  // Debug logging
  console.log('Filtered hotels count:', filteredHotels.length);
  console.log('Area filtered count:', areaFiltered?.length || 0);
  console.log('Base hotels count:', baseHotels.length);
  console.log('Sample hotel:', baseHotels[0]);
  // Use the pre-sorted and limited baseHotels
  const sortedHotels = baseHotels;

  const getPersonaIcon = (persona: TravelerPersona) => {
    switch (persona) {
      case 'Family': return <Users className="w-5 h-5" />;
      case 'Business': return <Briefcase className="w-5 h-5" />;
      case 'Luxury': return <Star className="w-5 h-5" />;
      case 'Solo': return <User className="w-5 h-5" />;
      case 'Couple': return <Heart className="w-5 h-5" />;
      default: return <Users className="w-5 h-5" />;
    }
  };

  const getPersonaColor = (persona: TravelerPersona) => {
    switch (persona) {
      case 'Family': return 'from-green-500 to-emerald-600';
      case 'Business': return 'from-blue-500 to-indigo-600';
      case 'Luxury': return 'from-purple-500 to-pink-600';
      case 'Solo': return 'from-orange-500 to-red-600';
      case 'Couple': return 'from-pink-500 to-rose-600';
      default: return 'from-blue-500 to-indigo-600';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <motion.div 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-white/80 backdrop-blur-lg border-b border-white/20 sticky top-0 z-50"
      >
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button
                onClick={onBack}
                className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                ←
              </button>
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-full bg-gradient-to-r ${getPersonaColor(persona)} text-white`}>
                  {getPersonaIcon(persona)}
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">
                    Perfect for {persona} Travelers
                    {selectedCity && selectedCity !== 'all' && (
                      <span className="text-gray-600"> in {selectedCity}</span>
                    )}
                  </h1>
                  <p className="text-sm text-gray-600">
                  {sortedHotels.length} AI-curated hotels found
                </p>
              </div>
            </div>
            </div>
            {/* Right: Search + Controls */}
            <div className="flex items-center space-x-3">
              <div className="relative">
                <input
                  type="text"
                  aria-label="Search area or landmark"
                  value={areaInput}
                  onChange={(e) => setAreaInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setAreaQuery(areaInput.trim());
                    }
                  }}
                  placeholder="Search area/place (e.g., Connaught Place)"
                  className="w-64 sm:w-96 md:w-[36rem] px-4 py-2 bg-white rounded-full shadow-md hover:shadow-lg transition-all border border-white/20 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
                {areaQuery && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                    {searching ? 'Searching…' : geoCenter ? 'Nearest' : 'Fuzzy'}
                  </span>
                )}
              </div>
              <button
                onClick={() => setAreaQuery(areaInput.trim())}
                disabled={searching}
                className="flex items-center space-x-2 px-4 py-2 bg-orange-500 text-white rounded-full shadow-md hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <SearchIcon className="w-4 h-4" />
                <span>Search</span>
              </button>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center space-x-2 px-4 py-2 bg-white rounded-full shadow-md hover:shadow-lg transition-all"
              >
                <Filter className="w-4 h-4" />
                <span>Filters</span>
              </button>
              <button
                onClick={() => setShowMap(!showMap)}
                className="flex items-center space-x-2 px-4 py-2 bg-white rounded-full shadow-md hover:shadow-lg transition-all"
              >
                <MapPin className="w-4 h-4" />
                <span>{showMap ? 'List' : 'Map'}</span>
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Filters Sidebar */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            className="fixed left-0 top-20 bottom-0 w-80 bg-white/95 backdrop-blur-lg border-r border-white/20 z-40 overflow-y-auto"
          >
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4">Filters</h3>
              
              {/* Price Filter */}
              <PriceFilter selectedRange={selectedPriceRange} onRangeSelect={setSelectedPriceRange} />

              {/* Sort Options */}
              <div className="mb-6">
                <h4 className="font-medium mb-3">Sort By</h4>
                <SortBy 
                  value={sortBy} 
                  onChange={(value, starRating) => {
                    setSortBy(value);
                    if (value === 'star' && starRating) {
                      setStarRatingFilter(starRating);
                    } else {
                      setStarRatingFilter(null);
                    }
                  }} 
                />
              </div>
              {/* Address/Area helper note */}
              <div className="text-xs text-gray-500">
                Tip: Type a landmark or area to see the 5 nearest hotels. Typos are handled automatically.
              </div>

              <div className="mt-6">
                <h4 className="font-medium mb-3">Filter By</h4>
                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder="Address"
                    value={addressFilter}
                    onChange={(e) => setAddressFilter(e.target.value)}
                    className="w-full p-2 border rounded"
                  />
                  <input
                    type="number"
                    placeholder="Max Price"
                    value={priceFilter || ''}
                    onChange={(e) => setPriceFilter(Number(e.target.value))}
                    className="w-full p-2 border rounded"
                  />
                  <input
                    type="number"
                    placeholder="Star Rating"
                    value={starRatingFilter || ''}
                    onChange={(e) => setStarRatingFilter(Number(e.target.value))}
                    className="w-full p-2 border rounded"
                  />
                  <input
                    type="number"
                    placeholder="Min Average Rating"
                    value={averageRatingFilter || ''}
                    onChange={(e) => setAverageRatingFilter(Number(e.target.value))}
                    className="w-full p-2 border rounded"
                  />
                  <button
                    onClick={applyFilters}
                    className="w-full px-4 py-2 bg-orange-500 text-white rounded-full shadow-md hover:bg-orange-600 transition-all"
                  >
                    Apply Filters
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className={`transition-all duration-300 ${showFilters ? 'ml-80' : ''}`}>
        {showMap ? (
          <InteractiveMap hotels={(filteredHotelsByApi || areaFiltered || filteredHotels).slice(0, 5)} />
        ) : (
          <div className="max-w-7xl mx-auto px-4 py-6">
            {/* AI Insights */}
            <AIInsights persona={persona} city={selectedCity} />

            {areaQuery && (
              <div className="mt-2 mb-4 text-sm text-gray-600">
                Showing top 5 hotels near <span className="font-medium text-gray-800">{areaQuery}</span>
                {geoCenter && (
                  <span> • sorted by nearest</span>
                )}
                {searchError && (
                  <span className="text-red-500"> • {searchError}</span>
                )}
              </div>
            )}

            {/* Top 5 Hotels Grid */}
            <motion.div 
              layout
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              <AnimatePresence>
                {(filteredHotelsByApi || areaFiltered || filteredHotels)
                  .slice(0, 5) // Ensure only top 5 hotels are displayed
                  .map((hotel, index) => (
                    <motion.div
                      key={hotel.name}
                      layout
                      initial={{ opacity: 0, y: 50 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -50 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <HotelCard hotel={hotel} index={index} />
                    </motion.div>
                  ))}
              </AnimatePresence>
            </motion.div>

            {(filteredHotelsByApi || areaFiltered || filteredHotels).length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-12"
              >
                <div className="text-gray-400 mb-4">
                  <MapPin className="w-16 h-16 mx-auto" />
                </div>
                <h3 className="text-xl font-semibold text-gray-700 mb-2">
                  No hotels found
                </h3>
                <p className="text-gray-500">
                  Try adjusting your filters or selecting a different city
                </p>
              </motion.div>
            )}
          </div>
        )}
      </div>

      {/* Floating Chatbot */}
      <Chatbot persona={persona} city={selectedCity} />
    </div>
  );
};

export default RecommendationsScreen;