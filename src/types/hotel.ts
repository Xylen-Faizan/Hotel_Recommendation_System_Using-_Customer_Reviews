// Defines the structure for a single booking platform link
export interface BookingLink {
  url: string;
  logo: string;
}

export interface PlatformRatings {
  Google?: { rating: number; reviews_count: number };
  Booking?: { rating: number; reviews_count: number };
  MakeMyTrip?: { rating: number; reviews_count: number };
  TripAdvisor?: { rating: number; reviews_count: number };
  Agoda?: { rating: number; reviews_count: number };
  Goibibo?: { rating: number; reviews_count: number };
  Expedia?: { rating: number; reviews_count: number };
}

export interface Hotel {
  id: number;
  name: string;
  city: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  image: string;
  platformRatings: {
    google: number;
    booking: number;
    tripadvisor: number;
  };
  reviews: string[];
  featureScores: {
    cleanliness: number;
    location: number;
    price: number;
    amenities: number;
    customer_service: number;
  };
}

export interface PlatformReview {
  rating: number;
  reviews_count: number;
}

export interface RecommendedHotel {
  uniq_id: string;
  property_name: string;
  name: string;
  city: string;
  image: string;
  overall_score: number;
  price_range: number; // Price in INR per night
  reviews_from_different_sites?: string | Record<string, PlatformReview>;
  parsedReviews?: Record<string, PlatformReview>;
  // New optional descriptive fields
  address?: string;
  hotel_star_rating?: number; // e.g., 2, 3, 4, 5
  room_type?: string;
  review_summary?: string;
  facilities_brief?: string;
  average_platform_rating?: number; // averaged from platform_ratings
  combinedScore?: number; // Combined score from sentiment and rating (0-1)
  features: {
    name: string;
    score: number;
  }[];
  badges: string[];
  platform_ratings: {
    Google?: { rating: number; reviews_count: number };
    Booking?: { rating: number; reviews_count: number };
    MakeMyTrip?: { rating: number; reviews_count: number };
    TripAdvisor?: { rating: number; reviews_count: number };
    Agoda?: { rating: number; reviews_count: number };
    Goibibo?: { rating: number; reviews_count: number };
    Expedia?: { rating: number; reviews_count: number };
  };
  // MODIFIED: This property now uses the BookingLink interface
  booking_links: {
    Google?: BookingLink;
    Booking?: BookingLink;
    MakeMyTrip?: BookingLink;
    TripAdvisor?: BookingLink;
  };
  coordinates: {
    lat: number;
    lng: number;
  };
  sentimentScore?: number;
  normalizedRating?: number;
}

export type TravelerPersona = 'Family' | 'Couple' | 'Solo' | 'Business' | 'Luxury';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  persona: TravelerPersona;
  preferredCity: string;
  favoriteHotels: number[];
  bookingHistory: number[];
}