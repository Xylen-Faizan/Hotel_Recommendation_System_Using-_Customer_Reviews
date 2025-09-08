import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer, util
from typing import List, Dict, Optional
import torch
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Hotel Recommendation API",
    description="API for hotel recommendations based on customer segments, reviews, and features",
    version="1.0.0"
)

# Allow CORS for frontend communication
origins = [
    "http://localhost:3000",  # Default React port
    "http://localhost:5173",  # Vite default port
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load the sentence transformer model first
model = SentenceTransformer('all-MiniLM-L6-v2')

# Load and preprocess the dataset
df = pd.read_csv('hotels_clean.csv')
df['hotel_facilities'] = df['hotel_facilities'].fillna('')
df['reviews_summary'] = df['reviews_summary'].fillna('')
df['top_positive_review'] = df['top_positive_review'].fillna('')
df['top_negative_review'] = df['top_negative_review'].fillna('')
df['hotel_description'] = df['hotel_description'].fillna('')

# Define feature keywords once
FEATURE_KEYWORDS = {
    'cleanliness': ['clean', 'tidy', 'spotless', 'dirty', 'messy', 'hygiene'],
    'location': ['location', 'central', 'convenient', 'accessible', 'nearby', 'far'],
    'service': ['service', 'staff', 'helpful', 'friendly', 'rude', 'unprofessional']
}

# Pre-compute keyword embeddings
KEYWORD_EMBEDDINGS = {
    feature: model.encode(' '.join(keywords), convert_to_tensor=True)
    for feature, keywords in FEATURE_KEYWORDS.items()
}

# Calculate feature scores based on reviews
def calculate_feature_scores(row):
    reviews = [row['top_positive_review'], row['top_negative_review'], row['reviews_summary']]
    reviews_text = ' '.join(reviews)
    review_embedding = model.encode(reviews_text, convert_to_tensor=True)
    
    scores = {}
    for feature, keyword_embedding in KEYWORD_EMBEDDINGS.items():
        similarity = util.pytorch_cos_sim(review_embedding, keyword_embedding)
        scores[feature] = float(similarity[0][0])
    
    return scores

# Add feature scores to the dataframe
print('Calculating feature scores...')
df['feature_scores'] = df.apply(calculate_feature_scores, axis=1)

# Create search context for each hotel
print('Creating search context...')
df['search_context'] = df.apply(
    lambda row: f"{row['hotel_facilities']} {row['reviews_summary']} {row['hotel_description']}",
    axis=1
)

# Create embeddings for the search context
print('Computing search context embeddings...')
search_context_embeddings = model.encode(df['search_context'].tolist(), convert_to_tensor=True)
print('Initialization complete!')


# Pydantic models for responses
class FeatureScores(BaseModel):
    cleanliness: int = Field(..., ge=0, le=100)
    location: int = Field(..., ge=0, le=100)
    service: int = Field(..., ge=0, le=100)

class HotelResponse(BaseModel):
    property_id: str
    property_name: str
    address: str
    city: str
    hotel_star_rating: float
    average_rating: float
    price: float
    feature_scores: FeatureScores
    match_confidence: Optional[int] = None
    relevant_facilities: Optional[List[str]] = None
    match_summary: Optional[str] = None

# Pydantic models for request bodies
class RecommendationRequest(BaseModel):
    city: str = Field(..., description="City name for hotel search")
    customer_segment: str = Field(..., description="Customer segment (e.g., Business, Leisure, Family)")

    class Config:
        schema_extra = {
            "example": {
                "city": "Mumbai",
                "customer_segment": "Business Traveler"
            }
        }

class FilterRequest(BaseModel):
    hotels: list
    address: str = None
    price: float = None
    hotel_star_rating: float = None
    average_rating: float = None

class ChatRequest(BaseModel):
    query: str

@app.post("/recommend", response_model=List[HotelResponse])
async def get_recommendations(request: RecommendationRequest):
    """
    Get top 5 hotel recommendations based on city and customer segment.
    """
    try:
        # Validate city and customer segment exist in the dataset
        if request.city not in df['city'].unique():
            raise HTTPException(status_code=404, detail=f"No hotels found in city: {request.city}")
        if request.customer_segment not in df['customer_segment'].unique():
            raise HTTPException(status_code=404, detail=f"Invalid customer segment: {request.customer_segment}")

        filtered_df = df[
            (df['city'] == request.city) &
            (df['customer_segment'] == request.customer_segment)
        ]

        if filtered_df.empty:
            raise HTTPException(
                status_code=404,
                detail=f"No hotels found for {request.customer_segment} in {request.city}"
            )
        
        # Calculate recommendation score based on average rating and feature scores
        def calculate_recommendation_score(row):
            avg_rating = row['average_rating']
            feature_scores = row['feature_scores']
            
            # Combine average rating (50% weight) with feature scores (50% weight)
            feature_avg = sum(feature_scores.values()) / len(feature_scores)
            return (avg_rating * 0.5) + (feature_avg * 0.5)
        
        filtered_df['recommendation_score'] = filtered_df.apply(calculate_recommendation_score, axis=1)
        
        # Sort by recommendation score
        sorted_df = filtered_df.sort_values(by='recommendation_score', ascending=False)
        top_5 = sorted_df.head(5)
        
        # Format response with feature scores
        result = []
        for _, hotel in top_5.iterrows():
            hotel_dict = {
                'property_id': str(hotel['property_id']),
                'property_name': hotel['property_name'],
                'address': hotel['address'],
                'city': hotel['city'],
                'hotel_star_rating': float(hotel['hotel_star_rating']),
                'average_rating': float(hotel['average_rating']),
                'price': float(hotel['price']),
                'feature_scores': {
                    'cleanliness': round(hotel['feature_scores']['cleanliness'] * 100),
                    'location': round(hotel['feature_scores']['location'] * 100),
                    'service': round(hotel['feature_scores']['service'] * 100)
                }
            }
            result.append(hotel_dict)
        
        return result

    except Exception as e:
        logger.error(f"Error in get_recommendations: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

class SortRequest(BaseModel):
    sort_by: str = Field(
        'average_rating',
        description="Field to sort by",
        enum=['price', 'hotel_star_rating', 'average_rating']
    )
    sort_order: str = Field(
        'desc',
        description="Sort order",
        enum=['asc', 'desc']
    )

class FilterRequest(BaseModel):
    city: str = Field(..., description="City name for hotel search")
    customer_segment: str = Field(..., description="Customer segment (e.g., Business, Leisure, Family)")
    address: Optional[str] = Field(None, description="Address substring to filter by")
    price_min: Optional[float] = Field(None, description="Minimum price", ge=0)
    price_max: Optional[float] = Field(None, description="Maximum price", ge=0)
    hotel_star_rating: Optional[float] = Field(None, description="Exact star rating to filter by", ge=0, le=5)
    average_rating_min: Optional[float] = Field(None, description="Minimum average rating", ge=0, le=5)
    sort: Optional[SortRequest] = Field(None, description="Sorting criteria")

    class Config:
        schema_extra = {
            "example": {
                "city": "Mumbai",
                "customer_segment": "Business Traveler",
                "price_min": 1000,
                "price_max": 5000,
                "hotel_star_rating": 4,
                "sort": {
                    "sort_by": "average_rating",
                    "sort_order": "desc"
                }
            }
        }

@app.post("/filter", response_model=List[HotelResponse])
async def filter_hotels(request: FilterRequest):
    """
    Filter and sort hotels based on multiple criteria.
    """
    try:
        # Validate city and customer segment exist in the dataset
        if request.city not in df['city'].unique():
            raise HTTPException(status_code=404, detail=f"No hotels found in city: {request.city}")
        if request.customer_segment not in df['customer_segment'].unique():
            raise HTTPException(status_code=404, detail=f"Invalid customer segment: {request.customer_segment}")

        # Start with basic filtering by city and customer segment
        filtered_df = df[
            (df['city'] == request.city) &
            (df['customer_segment'] == request.customer_segment)
        ].copy()

        if filtered_df.empty:
            raise HTTPException(
                status_code=404,
                detail=f"No hotels found for {request.customer_segment} in {request.city}"
            )
        
        # Apply additional filters
        if request.address:
            filtered_df = filtered_df[filtered_df['address'].str.contains(request.address, case=False)]
        
        if request.price_min is not None:
            filtered_df = filtered_df[filtered_df['price'] >= request.price_min]
        
        if request.price_max is not None:
            filtered_df = filtered_df[filtered_df['price'] <= request.price_max]
        
        if request.hotel_star_rating is not None:
            filtered_df = filtered_df[filtered_df['hotel_star_rating'] == request.hotel_star_rating]
        
        if request.average_rating_min is not None:
            filtered_df = filtered_df[filtered_df['average_rating'] >= request.average_rating_min]
        
        if filtered_df.empty:
            raise HTTPException(
                status_code=404,
                detail="No hotels found matching the specified criteria"
            )

        # Apply sorting if specified
        if request.sort:
            if request.sort.sort_by not in filtered_df.columns:
                raise HTTPException(status_code=400, detail=f"Invalid sort field: {request.sort.sort_by}")
            ascending = request.sort.sort_order == 'asc'
            filtered_df = filtered_df.sort_values(by=request.sort.sort_by, ascending=ascending)
        
        # Format response with feature scores
        result = []
        for _, hotel in filtered_df.iterrows():
            hotel_dict = {
                'property_id': str(hotel['property_id']),
                'property_name': hotel['property_name'],
                'address': hotel['address'],
                'city': hotel['city'],
                'hotel_star_rating': float(hotel['hotel_star_rating']),
                'average_rating': float(hotel['average_rating']),
                'price': float(hotel['price']),
                'feature_scores': {
                    'cleanliness': round(hotel['feature_scores']['cleanliness'] * 100),
                    'location': round(hotel['feature_scores']['location'] * 100),
                    'service': round(hotel['feature_scores']['service'] * 100)
                }
            }
            result.append(hotel_dict)
        
        return result

    except Exception as e:
        logger.error(f"Error in filter_hotels: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

class ChatRequest(BaseModel):
    query: str = Field(..., description="Natural language query about hotel features or amenities", min_length=3)

    class Config:
        schema_extra = {
            "example": {
                "query": "Find hotels with good cleanliness and a nice view"
            }
        }

class ChatResponse(HotelResponse):
    match_confidence: int = Field(..., ge=0, le=100, description="Confidence score for the match")
    relevant_facilities: List[str] = Field(default=[], description="Facilities matching the query")
    match_summary: str = Field(..., description="Summary of why this hotel matches the query")

@app.post("/chat", response_model=List[ChatResponse])
async def chat(request: ChatRequest):
    """
    Chatbot endpoint using RAG to find relevant hotels based on specific features and amenities.
    """
    try:
        if len(request.query.strip()) < 3:
            raise HTTPException(status_code=400, detail="Query must be at least 3 characters long")

        # Encode user query
        query_embedding = model.encode(request.query, convert_to_tensor=True)
        
        # Calculate similarity scores using pre-computed embeddings
        cos_scores = util.pytorch_cos_sim(query_embedding, search_context_embeddings)[0]
        top_results = torch.topk(cos_scores, k=5)
        
        # Get the indices and scores of top results
        top_indices = top_results[1].tolist()
        top_scores = top_results[0].tolist()
        
        if not top_indices:
            raise HTTPException(
                status_code=404,
                detail="No hotels found matching your query"
            )
        
        # Prepare response with relevant hotels and their match scores
        results = []
        for idx, score in zip(top_indices, top_scores):
            hotel = df.iloc[idx]
            
            # Create base hotel response
            hotel_dict = {
                'property_id': str(hotel['property_id']),
                'property_name': hotel['property_name'],
                'address': hotel['address'],
                'city': hotel['city'],
                'hotel_star_rating': float(hotel['hotel_star_rating']),
                'average_rating': float(hotel['average_rating']),
                'price': float(hotel['price']),
                'feature_scores': {
                    'cleanliness': round(hotel['feature_scores']['cleanliness'] * 100),
                    'location': round(hotel['feature_scores']['location'] * 100),
                    'service': round(hotel['feature_scores']['service'] * 100)
                }
            }
            
            # Add chat-specific fields
            hotel_dict['match_confidence'] = round(float(score) * 100)
            
            # Extract relevant facilities based on query
            facilities = hotel['hotel_facilities'].split('|')
            hotel_dict['relevant_facilities'] = [
                f for f in facilities 
                if any(word.lower() in f.lower() for word in request.query.split())
            ]
            
            # Add a summary of why this hotel matches the query
            summary_parts = [f"This hotel matches your query with {hotel_dict['match_confidence']}% confidence."]
            
            if hotel_dict['relevant_facilities']:
                summary_parts.append(f"It features: {', '.join(hotel_dict['relevant_facilities'])}.")
            
            # Add feature scores if relevant to query
            for feature, keywords in FEATURE_KEYWORDS.items():
                if any(keyword in request.query.lower() for keyword in keywords):
                    score = hotel_dict['feature_scores'][feature]
                    summary_parts.append(f"{feature.title()} score: {score}%.")
            
            hotel_dict['match_summary'] = ' '.join(summary_parts)
            results.append(hotel_dict)
        
        return results

    except Exception as e:
        logger.error(f"Error in chat endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")