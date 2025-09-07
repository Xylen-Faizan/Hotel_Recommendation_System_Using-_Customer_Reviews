import { RecommendedHotel } from '../types/hotel';

// Define a type for the component's props
interface BookingPlatformsProps {
  hotel: RecommendedHotel;
}

// A helper to get brand-specific colors for the buttons
const getPlatformColors = (platform: string) => {
  // Normalize platform names for consistent styling
  const lowerPlatform = platform.toLowerCase();
  if (lowerPlatform.includes('google')) {
    return 'bg-blue-600 hover:bg-blue-700';
  }
  if (lowerPlatform.includes('booking')) {
    return 'bg-blue-800 hover:bg-blue-900';
  }
  if (lowerPlatform.includes('makemytrip')) {
    return 'bg-red-500 hover:bg-red-600';
  }
  if (lowerPlatform.includes('tripadvisor')) {
    return 'bg-green-500 hover:bg-green-600';
  }
  return 'bg-gray-500 hover:bg-gray-600';
};


const BookingPlatforms = ({ hotel }: BookingPlatformsProps) => {
  const hasLinks = hotel.booking_links && Object.keys(hotel.booking_links).length > 0;

  // --- THIS IS THE FIX ---
  // This block now renders a clearly visible message when no links are found,
  // instead of disappearing completely.
  if (!hasLinks) {
    return (
      <div className="pt-3 border-t border-gray-100">
         <h4 className="font-semibold text-sm text-gray-800 mb-2">Compare & Book</h4>
         <div className="text-center text-sm text-gray-500 p-2 bg-gray-50 rounded-md">
            No booking links available for this hotel.
         </div>
      </div>
    );
  }

  return (
    <div className="pt-3 border-t border-gray-100">
      <h4 className="font-semibold text-sm text-gray-800 mb-2">Compare & Book</h4>
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(hotel.booking_links).map(([platform, linkData]) => {
          // Ensure linkData and its properties exist before rendering
          if (!linkData || !linkData.url || !linkData.logo) {
            return null; // Skip rendering for any invalid entries
          }

          return (
            <a
              key={platform}
              href={linkData.url} 
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center justify-center p-2 rounded-lg text-white text-sm font-bold transition-transform transform hover:scale-105 ${getPlatformColors(platform)}`}
            >
              <img 
                src={linkData.logo} 
                alt={`${platform} logo`} 
                className="w-4 h-4 mr-2"
              />
              <span>{platform}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
};

export default BookingPlatforms;