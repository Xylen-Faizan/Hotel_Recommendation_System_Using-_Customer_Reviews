import { useState, useEffect, useCallback } from 'react';
import { TravelerPersona, RecommendedHotel, BookingLink } from '../types/hotel';
import { recommendationEngine, AggregatedHotel } from '../services/RecommendationEngine';
import rawRecommendationsData from '../data/recommendations.json';

const logoUrls = {
  Google: 'https://www.google.com/favicon.ico',
  Booking: 'https://cdn.iconscout.com/icon/free-png-256/free-bookingcom-5041350-4209454.png',
  MakeMyTrip: 'https://cdn-icons-png.flaticon.com/512/732/732228.png',
  TripAdvisor: 'https://static.tacdn.com/favicon.ico'
};

const recommendationsData = Object.values(rawRecommendationsData as Record<string, any>).flat() as any[];

const getStaticRecommendations = (city?: string): RecommendedHotel[] => {
  const allRecommendations = (recommendationsData as any[])
    .filter(h => !city || (h.city && h.city.toLowerCase() === city.toLowerCase()))
    .slice(0, 10);

  return allRecommendations.map(hotel => ({
    name: hotel.name || 'Unknown Hotel',
    city: hotel.city || 'Unknown City',
    image: hotel.image || `https://source.unsplash.com/800x600/?hotel,${encodeURIComponent(hotel.city || 'hotel')}`,
    overall_score: hotel.overall_score || 0,
    price_range: hotel.price_range || 0,
    address: hotel.address || '',
    hotel_star_rating: hotel.hotel_star_rating || 0,
    room_type: hotel.room_type || '',
    review_summary: hotel.review_summary || '',
    facilities_brief: hotel.facilities_brief || '',
    average_platform_rating: hotel.average_platform_rating || 0,
    sentimentScore: (hotel as any).sentimentScore || 0.5,
    normalizedRating: (hotel as any).normalizedRating || 0.5,
    features: hotel.features || [],
    badges: hotel.badges || [],
    platform_ratings: hotel.platform_ratings || {},
    booking_links: {
      Google: {
        url: `https://www.google.com/travel/search?q=${encodeURIComponent(hotel.name + ' ' + (hotel.city || ''))}`,
        logo: logoUrls.Google
      },
      Booking: {
        url: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(hotel.name + ' ' + (hotel.city || ''))}`,
        logo: logoUrls.Booking
      },
      MakeMyTrip: {
        url: `https://www.makemytrip.com/hotels/hotel-listing/?searchText=${encodeURIComponent(hotel.name + ' ' + (hotel.city || ''))}`,
        logo: logoUrls.MakeMyTrip
      },
      TripAdvisor: {
        url: `https://www.tripadvisor.in/Search?q=${encodeURIComponent(hotel.name + ' ' + (hotel.city || ''))}`,
        logo: logoUrls.TripAdvisor
      }
    },
    coordinates: hotel.coordinates || { lat: 0, lng: 0 }
  }));
};


import { PipelineType, pipeline as transformersPipeline } from '@xenova/transformers';

class SentimentPipeline {
    static task: PipelineType = 'text-classification';
    static model = 'distilbert-base-uncased-finetuned-sst-2-english';
    private static instance: any = null;
    static maxLength = 512;
  
    static async getInstance(progress_callback?: (progress: any) => void): Promise<{
      (text: string): Promise<Array<{label: string, score: number}>>;
    }> {
      if (!this.instance) {
        try {
          this.instance = await transformersPipeline(this.task, this.model, { 
            progress_callback,
          });
        } catch (error) {
          console.error('Failed to load sentiment model, using fallback:', error);
          this.instance = async () => [
            { label: 'POSITIVE', score: 0.85 }
          ];
        }
      }
      return this.instance;
    }
  
    static async analyzeDocument(hotel: AggregatedHotel) {
        const documentText = [
            `Hotel: ${hotel.name}`,
            `Location: ${hotel.address || hotel.city || ''}`,
            `Description: ${hotel.reviewSummary || ''}`,
            `Features: ${hotel.tags ? hotel.tags.join(', ') : ''}`,
            ...hotel.reviews,
          ].filter(Boolean).join('. ');
      
          try {
            const pipeline = await this.getInstance();
            const truncatedText = documentText.substring(0, this.maxLength);
            const result = await pipeline(truncatedText);
            const sentimentResult = result[0];
      
            const sentimentScore = sentimentResult.label === 'POSITIVE' 
              ? sentimentResult.score 
              : 1 - sentimentResult.score;
            
            const normalizedRating = hotel.averageScore ? Math.min(1, hotel.averageScore / 5) : 0.5;
            const combinedScore = (sentimentScore + normalizedRating) / 2;
      
            return {
              sentimentScore,
              normalizedRating,
              combinedScore,
            };
          } catch (error) {
            console.error('Error in sentiment analysis for', hotel.name, error);
            const fallbackScore = 0.7;
            const normalizedRating = hotel.averageScore ? Math.min(1, hotel.averageScore / 5) : 0.5;
            return {
              sentimentScore: fallbackScore,
              normalizedRating,
              combinedScore: (fallbackScore + normalizedRating) / 2,
            };
          }
    }
}


export const useAI = () => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [recommendations, setRecommendations] = useState<RecommendedHotel[]>([]);
  const [insights, setInsights] = useState<any>(null);
  const [isEngineReady, setIsEngineReady] = useState(false);

  useEffect(() => {
    const initEngine = async () => {
      try {
        await recommendationEngine.initialize();
        setIsEngineReady(true);
      } catch (error) {
        console.error('Failed to initialize AI engine:', error);
        setIsEngineReady(false);
      }
    };

    initEngine();
  }, []);

  const analyzePreferences = useCallback(async (
    persona: TravelerPersona,
    city: string,
    preferences: string[] = [],
    options?: {
      priceMin?: number;
      priceMax?: number;
      starRatings?: number[];
    }
  ): Promise<RecommendedHotel[]> => {
    setIsAnalyzing(true);
    
    try {
      if (!isEngineReady) {
        const staticData = getStaticRecommendations(city);
        setRecommendations(staticData);
        return staticData;
      }
      
      const result = await recommendationEngine.generateRecommendations(
        persona, 
        city, 
        preferences, 
        options
      );

      if (!result || !result.hotels || result.hotels.length === 0) {
        const staticData = getStaticRecommendations(city);
        setRecommendations(staticData);
        return staticData;
      }

      const processedHotels = await Promise.all(
        result.hotels.map(async (hotel) => {
          const analysis = await SentimentPipeline.analyzeDocument(hotel);

          // Generate booking links from platform ratings
          const finalBookingLinks: { [key: string]: BookingLink } = {};
          const platforms = ['Google', 'Booking', 'MakeMyTrip', 'TripAdvisor'];

          platforms.forEach(platform => {
            const logo = logoUrls[platform as keyof typeof logoUrls];
            let finalUrl = '';

            // If the URL is still missing, create a generic search URL as a fallback
            if (!finalUrl) {
              const query = encodeURIComponent(`${hotel.name} ${hotel.city}`);
              switch (platform) {
                case 'Google':
                  finalUrl = `https://www.google.com/travel/search?q=${query}`;
                  break;
                case 'Booking':
                  finalUrl = `https://www.booking.com/searchresults.html?ss=${query}`;
                  break;
                case 'MakeMyTrip':
                  finalUrl = `https://www.makemytrip.com/hotels/hotel-listing/?searchText=${query}`;
                  break;
                case 'TripAdvisor':
                  finalUrl = `https://www.tripadvisor.com/Search?q=${query}`;
                  break;
              }
            }
            
            // Add the link to our final object
            if (finalUrl && logo) {
              finalBookingLinks[platform] = { url: finalUrl, logo };
            }
          });
          // --- END OF FIX ---

          // Generate a more reliable hotel image URL using the hotel name and city
          const hotelNameSlug = hotel.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          const citySlug = hotel.city ? `,${hotel.city.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}` : '';
          const imageUrl = `https://source.unsplash.com/800x600/?hotel,${hotelNameSlug}${citySlug}`;
          
          const recommendedHotel: RecommendedHotel = {
            name: hotel.name,
            city: hotel.city,
            image: imageUrl,
            overall_score: Math.round(analysis.combinedScore * 100),
            price_range: hotel.priceRange || 0,
            address: hotel.address,
            hotel_star_rating: hotel.starRating || 0,
            room_type: hotel.roomType || 'Standard',
            review_summary: hotel.reviewSummary || (hotel.reviews?.[0] || 'No reviews available'),
            facilities_brief: hotel.tags ? hotel.tags.slice(0, 5).join(', ') : '',
            average_platform_rating: hotel.averageScore || 0,
            sentimentScore: analysis.sentimentScore,
            normalizedRating: analysis.normalizedRating,
            combinedScore: analysis.combinedScore,
            features: [
              { name: 'Cleanliness', score: Math.round((hotel.averageScore || 0) * 20) },
              { name: 'Location', score: Math.round((hotel.averageScore || 0) * 20) },
              { name: 'Service', score: Math.round((hotel.averageScore || 0) * 20) },
              { name: 'Value', score: Math.round((hotel.averageScore || 0) * 20) }
            ],
            badges: [
              ...(analysis.sentimentScore > 0.75 ? ['Highly Rated'] : []),
              ...(hotel.starRating && hotel.starRating >= 4 ? ['Luxury'] : []),
            ],
            platform_ratings: hotel.platformRatings || {},
            coordinates: hotel.coordinates || { lat: 0, lng: 0 },
            booking_links: finalBookingLinks
          };

          return recommendedHotel;
        })
      );
      
      const finalRecommendations = processedHotels
        .filter((h): h is RecommendedHotel => h !== null)
        .sort((a, b) => (b.combinedScore || 0) - (a.combinedScore || 0));

      setRecommendations(finalRecommendations);
      setInsights(result.insights);
      return finalRecommendations;
    } catch (error) {
      console.error('Error in analyzePreferences:', error);
      const fallbackData = getStaticRecommendations(city);
      setRecommendations(fallbackData);
      return fallbackData;
    } finally {
      setIsAnalyzing(false);
    }
  }, [isEngineReady]);

  return {
    isAnalyzing,
    recommendations,
    insights,
    isEngineReady,
    analyzePreferences,
  };
};