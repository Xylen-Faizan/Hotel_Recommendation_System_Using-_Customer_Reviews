import React, { useMemo } from 'react';
import { Star, ExternalLink } from 'lucide-react';

// Combines reviews and booking links into a single sorted list of platforms
const processPlatforms = (
  reviews: Record<string, any>,
  bookingLinks: Record<string, any>
): Array<{ platform: string; rating: number; reviews_count: number; url: string }> => {
  const combined: Record<string, { rating: number; reviews_count: number; url: string }> = {};

  // Process reviews first
  if (reviews && typeof reviews === 'object') {
    for (const [key, value] of Object.entries(reviews)) {
      const platformKey = key.toLowerCase();
      if (value && typeof value === 'object') {
        const rating = Number(value.rating) || 0;
        const reviews_count = Number(value.reviews_count) || 0;
        combined[platformKey] = {
          url: '', // Empty URL if no booking link exists
          rating,
          reviews_count
        };
      } else if (value && typeof value === 'number') {
        // Fallback for legacy format where value is just the rating
        const rating = Number(value) || 0;
        combined[platformKey] = {
          url: '',
          rating,
          reviews_count: 0
        };
      }
    }
  }

  // Then process booking links to add URLs
  if (bookingLinks && typeof bookingLinks === 'object') {
    for (const [key, value] of Object.entries(bookingLinks)) {
      const platformKey = key.toLowerCase();
      const url = typeof value === 'string' ? value : value?.url;
      if (url) {
        if (combined[platformKey]) {
          combined[platformKey].url = url;
        } else {
          combined[platformKey] = {
            url,
            rating: 0,
            reviews_count: 0
          };
        }
      }
    }
  }

  // Platform display order
  const platformOrder = ['booking.com', 'google', 'makemytrip', 'tripadvisor'];

  // Convert to array and sort
  return Object.entries(combined)
    .map(([platform, data]) => ({ platform, ...data }))
    .filter(item => platformOrder.includes(item.platform.toLowerCase()))
    .sort((a, b) => {
      const indexA = platformOrder.indexOf(a.platform.toLowerCase());
      const indexB = platformOrder.indexOf(b.platform.toLowerCase());
      return indexA - indexB;
    });
};


// Platform data with verified icons and display names
export const PLATFORM_DATA: Record<string, { icon: string; white_icon?: string; name: string }> = {
    'booking.com': {
      icon: '/platform-logos/booking.svg',
      name: 'Booking.com',
    },
    'google': {
      icon: '/platform-logos/google.svg',
      name: 'Google',
    },
    'makemytrip': {
      icon: '/platform-logos/makemytrip.svg',
      name: 'MakeMyTrip',
    },
    'tripadvisor': {
      icon: '/platform-logos/tripadvisor.svg',
      name: 'TripAdvisor',
    },
    'default': {
      icon: '/placeholder-hotel.svg',
      name: 'View Deal',
    },
  };
  
  // Platform color styles
  export const PLATFORM_COLORS: Record<string, { bg: string; text: string; isDark: boolean }> = {
    'booking.com': { bg: 'bg-blue-700', text: 'text-white', isDark: true },
    'google': { bg: 'bg-white', text: 'text-gray-700', isDark: false },
    'makemytrip': { bg: 'bg-sky-500', text: 'text-white', isDark: true },
    'tripadvisor': { bg: 'bg-green-500', text: 'text-white', isDark: true },
    'default': { bg: 'bg-gray-200', text: 'text-gray-800', isDark: false },
  };
  
  // Helper to find the matching platform key
  const getPlatformKey = (platform: string): string => {
    const lowerPlatform = platform.toLowerCase();
    // Exact match first
    if (PLATFORM_DATA[lowerPlatform]) {
      return lowerPlatform;
    }
    // Then check for partial matches (e.g., 'mmt_hotels' -> 'mmt')
    const key = Object.keys(PLATFORM_DATA).find(p => lowerPlatform.includes(p) && p !== 'default');
    return key || 'default';
  };
  

interface BookingPlatformsProps {
  reviews: Record<string, any>;
  bookingLinks: Record<string, any>;
}

const BookingPlatforms: React.FC<BookingPlatformsProps> = ({ reviews, bookingLinks }) => {
  const sortedPlatforms = useMemo(
    () => {
      console.log('Processing platforms with:', { reviews, bookingLinks });
      return processPlatforms(reviews, bookingLinks);
    },
    [reviews, bookingLinks]
  );

  if (sortedPlatforms.length === 0) {
    return (
      <div className="mt-4">
        <h4 className="text-md font-bold text-gray-800 mb-2">Compare & Book</h4>
        <p className="text-xs text-gray-500">No booking information available.</p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <h4 className="text-md font-bold text-gray-800 mb-3">Compare & Book</h4>
      <div className="flex flex-col gap-2">
        {sortedPlatforms.map(({ platform, rating, reviews_count, url }) => {
          let platformKey = getPlatformKey(platform);

          // If the platform is unknown but the URL is for booking.com, treat it as booking.com
          if (platformKey === 'default' && url && url.includes('booking.com')) {
            platformKey = 'booking.com';
          }

          const platformInfo = PLATFORM_DATA[platformKey];
          const platformColor = PLATFORM_COLORS[platformKey] || PLATFORM_COLORS['default'];

          // Use the white icon if the background is dark and a white icon is available
          const iconUrl = platformColor.isDark && platformInfo.white_icon
              ? platformInfo.white_icon
              : platformInfo.icon;

          return (
            <a
              key={platform}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center justify-between p-3 rounded-lg transition-transform hover:scale-105 ${platformColor.bg} ${platformColor.text}`}
            >
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                  <img
                    src={iconUrl}
                    alt={`${platformInfo.name} logo`}
                    className="w-10 h-10 object-contain"
                    style={{ filter: platformKey === 'google' && platformColor.isDark ? 'invert(1)' : 'none' }}
                  />
                  <span className="text-base font-semibold">{platformInfo.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {rating > 0 && (
                    <div className="flex items-center gap-1">
                      <Star className="w-4 h-4 text-yellow-300 fill-current" />
                      <span className="text-sm font-medium">{rating.toFixed(1)}</span>
                      {reviews_count > 0 && (
                        <span className="text-xs opacity-90 ml-1">
                          ({reviews_count.toLocaleString()})
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <ExternalLink className="w-5 h-5 opacity-80" />
            </a>
          );
        })}
      </div>
    </div>
  );
};

export default BookingPlatforms;