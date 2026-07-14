# Tashus Vehicle API Audit for AI Chatbot Integration

## Overview
This document provides comprehensive API documentation for the Tashus vehicle search and details endpoints specifically designed for AI chatbot integration. It includes detailed examples of how to construct API calls with various filters and parse responses.

## Base Configuration
```
Base URL: https://services.tashus.com/api
Search Endpoint: /search/find-cars
Details Endpoint: /search/find-cars/{listingId}
```

## Authentication
These are public endpoints and do not require authentication.

## 1. VEHICLE SEARCH API

### Endpoint
```
GET /api/search/find-cars
```

### Purpose
Search for available vehicles with location, date, and filter-based criteria.

### Query Parameters Reference

#### Location Parameters (At least one required)
| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `city` | string | City name | "Sydney", "Melbourne" |
| `country` | string | Country code | "au" (Australia) |
| `region` | string | State/region code | "nsw", "vic", "qld" |
| `postcode` | string | Postal code | "2000", "3000" |
| `lat` | string | Latitude | "-33.866275" |
| `long` | string | Longitude | "151.213107" |

#### Date/Time Parameters (Optional but recommended)
| Parameter | Type | Description | Format |
|-----------|------|-------------|---------|
| `from` | string | Pickup datetime | ISO 8601: "2024-07-22T10:00:00.000Z" |
| `to` | string | Return datetime | ISO 8601: "2024-07-25T18:00:00.000Z" |
| `currentDateTime` | string | Current time | ISO 8601: "2024-02-15T09:30:00.000Z" |

#### Vehicle Filter Parameters (Optional)
| Parameter | Type | Description | Values |
|-----------|------|-------------|--------|
| `cType` | string | Car type filter | "SUV", "Sedan", "Hatchback", "Ute", "Van" |
| `fType` | string | Fuel type filter | "Petrol", "Diesel", "Electric", "Hybrid" |
| `tType` | string | Transmission filter | "Manual", "Automatic" |
| `year` | number | Manufacturing year | 2020, 2021, 2022, etc. |
| `color` | string | Vehicle color | "Red", "Blue", "White", "Black" |

#### Pagination Parameters (Optional)
| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `page` | string | Page number | "1" |
| `pageSize` | string | Results per page | "10" |

### API Call Examples

#### Example 1: Basic Search by City and Date
**User Query:** "Show me cars in Sydney for July 22nd"

```javascript
// API Call
GET /api/search/find-cars?city=Sydney&country=au&region=nsw&from=2024-07-22T10:00:00.000Z&to=2024-07-22T18:00:00.000Z

// Explanation:
// - city: "Sydney" (user specified location)
// - country: "au" (default for Australia)
// - region: "nsw" (Sydney is in New South Wales)
// - from: July 22, 2024 at 10:00 AM UTC
// - to: July 22, 2024 at 6:00 PM UTC (same day return)
```

#### Example 2: SUV Search with Date Filter
**User Query:** "Find SUVs available from July 22 to July 25"

```javascript
// API Call
GET /api/search/find-cars?city=Sydney&country=au&cType=SUV&from=2024-07-22T10:00:00.000Z&to=2024-07-25T18:00:00.000Z

// Explanation:
// - cType: "SUV" (vehicle type filter)
// - from: July 22, 2024 at 10:00 AM UTC
// - to: July 25, 2024 at 6:00 PM UTC (3-day rental)
```

#### Example 3: Multiple Filters
**User Query:** "I need an automatic petrol SUV in Melbourne for the weekend"

```javascript
// API Call  
GET /api/search/find-cars?city=Melbourne&country=au&region=vic&cType=SUV&fType=Petrol&tType=Automatic&from=2024-07-27T10:00:00.000Z&to=2024-07-28T18:00:00.000Z

// Explanation:
// - city: "Melbourne"
// - region: "vic" (Victoria state)
// - cType: "SUV" (vehicle type)
// - fType: "Petrol" (fuel type)
// - tType: "Automatic" (transmission type)
// - Weekend dates (Saturday to Sunday)
```

#### Example 4: Location-based Search with Coordinates
**User Query:** "Cars near my current location"

```javascript
// API Call
GET /api/search/find-cars?lat=-33.866275&long=151.213107&from=2024-07-22T10:00:00.000Z&to=2024-07-24T18:00:00.000Z

// Explanation:
// - lat/long: Sydney CBD coordinates
// - API will find vehicles within 15km radius
// - Uses geospatial search for proximity
```
### Response Structure

```javascript
{
  "totalDocuments": 150,        // Total vehicles in database
  "totalDataSize": 0,           // Data size (currently unused)
  "currentPage": 1,             // Current page number
  "pageSize": 10,               // Results per page
  "resultCount": 8,             // Actual results in response
  "results": [                  // Array of vehicle objects
    {
      "_id": "507f1f77bcf86cd799439011",
      "listingId": 1234,         // Unique vehicle identifier
      "hostId": "host123",       // Vehicle owner ID
      "carNickName": "Blue Thunder",
      
      // Vehicle Information
      "car": {
        "make": "Toyota",
        "model": "RAV4",
        "transmissionType": "Automatic",
        "seats": 5,
        "carType": "SUV",
        "fuelType": "Petrol"
      },
      
      // Location Details
      "location": {
        "pickupAddress": {
          "street": "123 George Street",
          "city": "Sydney",
          "state": "New South Wales",
          "country": "Australia",
          "postalCode": "2000",
          "stateShortCode": "nsw",
          "countryShortCode": "au",
          "coordinates": [151.213107, -33.866275]  // [lng, lat]
        }
      },
      
      // Pricing Information
      "rates": {
        "hourlyRates": {
          "currency": "AUD",
          "amount": 12.5
        },
        "dailyRates": {
          "currency": "AUD", 
          "amount": 89.0
        }
      },
      
      // Main Photo
      "photos": {
        "coverPhoto": {
          "imageInfo": {
            "public_id": "tashus/vehicles/abc123",
            "secure_url": "https://res.cloudinary.com/tashus/image/upload/v1/tashus/vehicles/abc123.jpg",
            "format": "jpg"
          },
          "storageProvider": "cloudinary"
        }
      },
      
      // Availability Rules (Important for booking logic)
      "availability": {
        "pickupReturnHour": {
          "alwaysAvailable": false,
          "customAvailability": [
            {
              "dayOfWeek": "mon",
              "allDay": true,
              "availability": "always",
              "customHours": []
            }
          ]
        },
        "noticeInAdvance": {
          "alwaysAvailableImmediately": false,
          "hoursRequired": 2  // Requires 2 hours advance notice
        },
        "minTripDuration": {
          "noMinimum": false,
          "unit": "hours",
          "shortestDuration": 3  // Minimum 3-hour rental
        },
        "maxTripDuration": {
          "noMaximum": true,
          "unit": "days",
          "longestDuration": 0
        }
      },
      
      // Business Metrics
      "totalTrips": 45,           // Completed rentals
      "ratingsReceivedFrom": 12,  // Number of reviews
      "totalRatings": 58,         // Total rating points (avg = 58/12 = 4.8)
      
      // Computed Fields (when dates provided)
      "isNoticeHourRequired": false  // Whether advance notice needed for this booking
    }
  ]
}
```

### Key Response Fields for AI Processing

#### Essential Vehicle Info
- `listingId`: Unique identifier for booking
- `car.make`, `car.model`: Vehicle identification
- `car.carType`: Category (SUV, Sedan, etc.)
- `car.seats`: Seating capacity
- `car.transmissionType`: Manual/Automatic
- `car.fuelType`: Petrol/Diesel/Electric/Hybrid

#### Pricing Data
- `rates.hourlyRates.amount`: Price per hour
- `rates.dailyRates.amount`: Price per day
- `rates.dailyRates.currency`: Always "AUD"

#### Location Info
- `location.pickupAddress.city`: Pickup city
- `location.pickupAddress.street`: Pickup address
- `location.pickupAddress.coordinates`: [longitude, latitude]

#### Booking Requirements
- `availability.noticeInAdvance.hoursRequired`: Advance booking time
- `availability.minTripDuration`: Minimum rental duration
- `isNoticeHourRequired`: Whether user's requested time meets notice requirement
## 2. VEHICLE DETAILS API

### Endpoint
```
GET /api/search/find-cars/{listingId}
```

### Purpose
Get comprehensive details for a specific vehicle including complete specifications, host information, and booking guidelines.

### Path Parameters
| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `listingId` | number | Vehicle listing ID from search results | 1234 |

### API Call Example
**User Query:** "Tell me more about vehicle 1234"

```javascript
// API Call
GET /api/search/find-cars/1234

// No query parameters needed - listingId in path is sufficient
```

### Complete Response Structure

```javascript
{
  "_id": "507f1f77bcf86cd799439011",
  "listingId": 1234,
  "hostId": "host123",
  "listingStatus": "listed",  // "listed", "pending", "unlisted"
  "carNickName": "Blue Thunder",
  
  // Complete Vehicle Specifications
  "car": {
    "vin": "JN1AZ4EH9BM123456",
    "make": "Toyota",
    "model": "RAV4",
    "year": 2022,
    "color": "Blue",
    "carType": "SUV", 
    "seats": 5,
    "doors": 4,
    "windows": 4,
    "fuelType": "Petrol",
    "transmissionType": "Automatic",
    "trim": "GXL",
    "mileage": {
      "distance": 25000,
      "units": "km"
    }
  },
  
  // Vehicle Features
  "features": [
    "Air Conditioning",
    "Bluetooth",
    "GPS Navigation", 
    "Reverse Camera",
    "Apple CarPlay"
  ],
  "additionalFeatures": [
    "Roof Rails",
    "Tow Bar"
  ],
  
  // Detailed Descriptions
  "additionalInfos": {
    "carDescription": "<p>Well-maintained 2022 Toyota RAV4 perfect for city driving and weekend adventures...</p>",
    "guidelines": "Please return with same fuel level. No smoking. No pets."
  },
  
  "vehicleObligations": {
    "neverWrittenOff": true,
    "ctpInsurance": true
  },
  
  // Complete Location Information
  "location": {
    "pickupAddress": {
      "street": "123 George Street",
      "city": "Sydney", 
      "state": "New South Wales",
      "country": "Australia",
      "postalCode": "2000",
      "stateShortCode": "nsw",
      "countryShortCode": "au",
      "coordinates": [151.213107, -33.866275]
    },
    "parkingInstructions": "Level 2 of parking garage, bay 15. Use intercom at entrance."
  },
  
  // Complete Availability Rules
  "availability": {
    "pickupReturnHour": {
      "alwaysAvailable": false,
      "customAvailability": [
        {
          "dayOfWeek": "mon",
          "allDay": false,
          "availability": "custom",
          "customHours": [
            {
              "startTime": "2024-02-15T08:00:00.000Z",
              "endTime": "2024-02-15T18:00:00.000Z", 
              "status": "free"
            }
          ]
        }
      ]
    },
    "noticeInAdvance": {
      "alwaysAvailableImmediately": false,
      "hoursRequired": 2
    },
    "minTripDuration": {
      "noMinimum": false,
      "unit": "hours",
      "shortestDuration": 3
    },
    "maxTripDuration": {
      "noMaximum": false,
      "unit": "days", 
      "longestDuration": 7
    }
  },
  
  // Complete Pricing Structure
  "rates": {
    "hourlyRates": {
      "currency": "AUD",
      "amount": 12.5
    },
    "dailyRates": {
      "currency": "AUD",
      "amount": 89.0
    },
    
    // Peak Pricing (Higher rates on certain days)
    "peakIncrease": [
      {
        "increaseType": "percentage",
        "increaseAmount": 15,
        "increaseDays": ["fri", "sat", "sun"]
      }
    ],
    
    // Long Booking Discounts
    "longBookingDiscounts": [
      {
        "duration": 7,
        "unit": "days",
        "discountType": "percentage", 
        "discountAmount": 10
      }
    ],
    
    // Advance Booking Discounts
    "advanceBookingDiscounts": [
      {
        "advanceDays": 14,
        "discountType": "percentage",
        "discountAmount": 5
      }
    ],
    
    // Custom Pricing for Specific Dates
    "customPricing": [
      {
        "startDate": "2024-12-20T00:00:00.000Z",
        "endDate": "2024-01-05T00:00:00.000Z",
        "hourlyRate": 20.0,
        "dailyRate": 150.0
      }
    ]
  },
  
  // Host/Owner Information
  "hostInfo": {
    "userId": "host123",
    "username": "john_doe",
    "firstName": "John",
    "lastName": "Doe",
    "profileSummary": {
      "partner": "Experienced car sharing host since 2020",
      "guest": "Friendly and accommodating"
    },
    "picture": {
      "imageInfo": {
        "public_id": "tashus/hosts/host123",
        "secure_url": "https://res.cloudinary.com/tashus/image/upload/v1/host123.jpg",
        "format": "jpg"
      }
    },
    "createdAt": "2020-03-15T10:00:00.000Z",
    "hostTotalTrips": 156,
    "hostRatingCount": 45,
    "hostRatingTotal": 215  // Average: 215/45 = 4.78
  },
  
  // Complete Photo Gallery
  "photos": {
    "coverPhoto": {
      "imageInfo": {
        "public_id": "tashus/vehicles/abc123",
        "secure_url": "https://res.cloudinary.com/tashus/vehicles/abc123.jpg",
        "format": "jpg"
      }
    },
    "initialConditionPhotos": [
      {
        "imageInfo": {
          "public_id": "tashus/vehicles/abc123_front",
          "secure_url": "https://res.cloudinary.com/tashus/vehicles/abc123_front.jpg",
          "format": "jpg" 
        }
      }
    ],
    "additionalPhotos": [
      {
        "imageInfo": {
          "public_id": "tashus/vehicles/abc123_interior",
          "secure_url": "https://res.cloudinary.com/tashus/vehicles/abc123_interior.jpg", 
          "format": "jpg"
        }
      }
    ],
    "vehicleInspectionPhotos": []
  },
  
  // Usage Restrictions
  "distance": {
    "unlimitedTravel": false,
    "maximumDailyDistance": 200,  // 200km per day limit
    "additionalFeePerKilometer": 0.35  // $0.35 per extra km
  },
  
  // Booking Guidelines
  "guidelines": {
    "pickupInformation": "Vehicle is located in Level 2 parking. Call upon arrival.",
    "returnInformation": "Return to same parking bay. Fuel level should match pickup.", 
    "wordOfWelcome": "Welcome! Hope you enjoy your trip. Drive safely!",
    "firstPointOfContactIsMe": true
  },
  
  // Business Metrics
  "totalTrips": 78,
  "ratingsReceivedFrom": 23,
  "totalRatings": 112,  // Average: 112/23 = 4.87
  
  // Timestamps
  "createdAt": "2024-01-15T10:00:00.000Z",
  "updatedAt": "2024-02-10T15:30:00.000Z"
}
```

### Key Details Response Fields

#### Vehicle Specifications
- `car.year`, `car.make`, `car.model`: Complete vehicle identification
- `car.vin`: Vehicle identification number
- `car.mileage.distance`: Current odometer reading
- `features[]`: Standard equipment list
- `additionalFeatures[]`: Extra features added by owner

#### Host Information  
- `hostInfo.firstName`, `hostInfo.lastName`: Owner name
- `hostInfo.hostTotalTrips`: Owner's experience level
- `hostInfo.hostRatingCount`, `hostInfo.hostRatingTotal`: Owner rating data
- `hostInfo.picture.imageInfo.secure_url`: Owner photo
#### Booking Guidelines
- `guidelines.pickupInformation`: Pickup instructions
- `guidelines.returnInformation`: Return requirements  
- `guidelines.wordOfWelcome`: Host's welcome message
- `location.parkingInstructions`: Detailed parking directions

#### Usage Restrictions
- `distance.unlimitedTravel`: Whether km limits apply
- `distance.maximumDailyDistance`: Daily km allowance
- `distance.additionalFeePerKilometer`: Fee for exceeding limit

## 3. FILTER IMPLEMENTATION GUIDE

### Date and Time Filtering

#### Converting Natural Language Dates
```javascript
// User says: "July 22nd SUV"
const userDate = "July 22";
const currentYear = 2024;

// Convert to ISO format
const pickupDate = `${currentYear}-07-22T10:00:00.000Z`;  // 10 AM pickup
const returnDate = `${currentYear}-07-22T18:00:00.000Z`;  // 6 PM return (same day)

// For multi-day: "July 22 to July 25"  
const pickupDate = `${currentYear}-07-22T10:00:00.000Z`;
const returnDate = `${currentYear}-07-25T18:00:00.000Z`;
```

#### Common Date Patterns
```javascript
const datePatterns = {
  "today": new Date(),
  "tomorrow": new Date(Date.now() + 24*60*60*1000),
  "this weekend": [getSaturday(), getSunday()],
  "next week": [getNextMonday(), getNextFriday()],
  "July 22": new Date(2024, 6, 22), // Month is 0-indexed
  "22/07/2024": new Date(2024, 6, 22)
};
```

### Vehicle Type Filtering

#### Vehicle Category Mapping
```javascript
const vehicleTypeMap = {
  // Direct matches
  "SUV": "SUV",
  "sedan": "Sedan", 
  "hatchback": "Hatchback",
  "ute": "Ute",
  "van": "Van",
  "convertible": "Convertible",
  
  // Synonyms and variations
  "4WD": "SUV",
  "4x4": "SUV", 
  "off-road": "SUV",
  "truck": "Ute",
  "pickup": "Ute",
  "wagon": "Wagon",
  "sports car": "Coupe",
  "luxury": "Luxury"
};

// Usage in API call:
// User: "Find me a 4WD" → cType=SUV
```

### Multiple Filter Implementation

#### Example: Complex Query Processing
**User Query:** "I need an automatic petrol SUV in Sydney for July 22-25 under $100 per day"

```javascript
// 1. Extract filters from query
const filters = {
  location: "Sydney",
  vehicleType: "SUV", 
  transmission: "Automatic",
  fuelType: "Petrol",
  startDate: "2024-07-22",
  endDate: "2024-07-25",
  maxDailyPrice: 100
};

// 2. Build API call
const apiUrl = `/api/search/find-cars?` + new URLSearchParams({
  city: "Sydney",
  country: "au", 
  region: "nsw",
  cType: "SUV",
  fType: "Petrol", 
  tType: "Automatic",
  from: "2024-07-22T10:00:00.000Z",
  to: "2024-07-25T18:00:00.000Z"
});

// 3. Filter results by price (done on frontend)
const filteredResults = response.results.filter(car => 
  car.rates.dailyRates.amount <= 100
);
```
## 4. AI CHATBOT INTEGRATION PATTERNS

### Query Processing Workflow

#### Step 1: Parse User Intent
```javascript
function parseUserQuery(query) {
  const intent = {
    location: extractLocation(query),       // "Sydney", "Melbourne"
    dates: extractDates(query),            // "July 22", "this weekend"
    vehicleType: extractVehicleType(query), // "SUV", "sedan"  
    transmission: extractTransmission(query), // "automatic", "manual"
    fuelType: extractFuelType(query),      // "petrol", "electric"
    priceRange: extractPrice(query),       // "under $100"
    duration: extractDuration(query)       // "3 days", "weekend"
  };
  
  return intent;
}
```

#### Step 2: Build API Parameters  
```javascript
function buildSearchParams(intent) {
  const params = {};
  
  // Location mapping
  if (intent.location) {
    const locationMap = {
      "Sydney": { city: "Sydney", region: "nsw", country: "au" },
      "Melbourne": { city: "Melbourne", region: "vic", country: "au" },
      "Brisbane": { city: "Brisbane", region: "qld", country: "au" }
    };
    Object.assign(params, locationMap[intent.location]);
  }
  
  // Vehicle filters
  if (intent.vehicleType) params.cType = intent.vehicleType;
  if (intent.transmission) params.tType = intent.transmission;  
  if (intent.fuelType) params.fType = intent.fuelType;
  
  // Date conversion
  if (intent.dates) {
    params.from = convertToISO(intent.dates.start);
    params.to = convertToISO(intent.dates.end);
  }
  
  return params;
}
```

#### Step 3: Execute Search
```javascript
async function searchVehicles(params) {
  try {
    const queryString = new URLSearchParams(params).toString();
    const response = await fetch(`/api/search/find-cars?${queryString}`);
    const data = await response.json();
    
    if (response.ok) {
      return {
        success: true,
        vehicles: data.results,
        total: data.totalDocuments,
        count: data.resultCount
      };
    } else {
      return {
        success: false,
        error: data.message || "Search failed"
      };
    }
  } catch (error) {
    return {
      success: false, 
      error: "Network error occurred"
    };
  }
}
```

#### Step 4: Format Response
```javascript
function formatSearchResults(searchResult, userIntent) {
  if (!searchResult.success) {
    return `Sorry, I couldn't find any vehicles. ${searchResult.error}`;
  }
  
  const vehicles = searchResult.vehicles;
  
  if (vehicles.length === 0) {
    return `No vehicles found matching your criteria in ${userIntent.location}. Try adjusting your dates or location.`;
  }
  
  let response = `Found ${vehicles.length} vehicles in ${userIntent.location}:\n\n`;
  
  vehicles.slice(0, 5).forEach((vehicle, index) => {
    const dailyRate = vehicle.rates.dailyRates.amount;
    const hourlyRate = vehicle.rates.hourlyRates.amount;
    
    response += `${index + 1}. ${vehicle.car.year} ${vehicle.car.make} ${vehicle.car.model}\n`;
    response += `   • Type: ${vehicle.car.carType} | Seats: ${vehicle.car.seats}\n`; 
    response += `   • ${vehicle.car.transmissionType} ${vehicle.car.fuelType}\n`;
    response += `   • $${dailyRate}/day or $${hourlyRate}/hour\n`;
    response += `   • Location: ${vehicle.location.pickupAddress.city}\n\n`;
  });
  
  if (vehicles.length > 5) {
    response += `... and ${vehicles.length - 5} more vehicles available.`;
  }
  
  return response;
}
```
### Vehicle Details Integration

#### Get Detailed Information
```javascript
async function getVehicleDetails(listingId) {
  try {
    const response = await fetch(`/api/search/find-cars/${listingId}`);
    const vehicle = await response.json();
    
    if (response.ok) {
      return formatVehicleDetails(vehicle);
    } else {
      return "Sorry, I couldn't find details for that vehicle.";
    }
  } catch (error) {
    return "Error retrieving vehicle details.";
  }
}

function formatVehicleDetails(vehicle) {
  const rating = vehicle.hostInfo.hostRatingCount > 0 
    ? (vehicle.hostInfo.hostRatingTotal / vehicle.hostInfo.hostRatingCount).toFixed(1)
    : "No ratings yet";
    
  let details = `**${vehicle.car.year} ${vehicle.car.make} ${vehicle.car.model}**\n\n`;
  
  // Basic specs
  details += `🚗 **Vehicle Details:**\n`;
  details += `• Type: ${vehicle.car.carType}\n`;
  details += `• Seats: ${vehicle.car.seats} | Doors: ${vehicle.car.doors}\n`; 
  details += `• Transmission: ${vehicle.car.transmissionType}\n`;
  details += `• Fuel: ${vehicle.car.fuelType}\n`;
  details += `• Mileage: ${vehicle.car.mileage.distance.toLocaleString()} ${vehicle.car.mileage.units}\n\n`;
  
  // Pricing
  details += `💰 **Pricing:**\n`;
  details += `• Daily Rate: $${vehicle.rates.dailyRates.amount}\n`;
  details += `• Hourly Rate: $${vehicle.rates.hourlyRates.amount}\n\n`;
  
  // Features
  if (vehicle.features.length > 0) {
    details += `✨ **Features:**\n`;
    vehicle.features.slice(0, 5).forEach(feature => {
      details += `• ${feature}\n`;
    });
    if (vehicle.features.length > 5) {
      details += `• ... and ${vehicle.features.length - 5} more features\n`;
    }
    details += `\n`;
  }
  
  // Host info
  details += `👤 **Host: ${vehicle.hostInfo.firstName}**\n`;
  details += `• Experience: ${vehicle.hostInfo.hostTotalTrips} trips completed\n`;
  details += `• Rating: ${rating} ⭐\n\n`;
  
  // Location
  details += `📍 **Pickup Location:**\n`;
  details += `${vehicle.location.pickupAddress.street}, ${vehicle.location.pickupAddress.city}\n\n`;
  
  // Booking requirements
  details += `📋 **Booking Requirements:**\n`;
  if (!vehicle.availability.noticeInAdvance.alwaysAvailableImmediately) {
    details += `• ${vehicle.availability.noticeInAdvance.hoursRequired} hours advance notice required\n`;
  }
  if (!vehicle.availability.minTripDuration.noMinimum) {
    details += `• Minimum rental: ${vehicle.availability.minTripDuration.shortestDuration} ${vehicle.availability.minTripDuration.unit}\n`;
  }
  if (!vehicle.distance.unlimitedTravel) {
    details += `• Daily km limit: ${vehicle.distance.maximumDailyDistance}km ($${vehicle.distance.additionalFeePerKilometer}/km over)\n`;
  }
  
  return details;
}
```

## 5. ERROR HANDLING

### Common API Errors
```javascript
const errorHandling = {
  // Invalid date range
  "Invalid Date Range": "The pickup date must be before the return date. Please check your dates.",
  
  // Past dates
  "Invalid Dates": "Booking dates must be in the future. Please select upcoming dates.",
  
  // No results
  "No vehicles found": "No vehicles available for your criteria. Try different dates or location.",
  
  // Vehicle not found  
  "No car listing found": "That vehicle is no longer available. Please search for other options.",
  
  // Server errors
  "Internal server error": "Service temporarily unavailable. Please try again in a moment."
};

function handleAPIError(error) {
  const message = error.message || error.error;
  return errorHandling[message] || "An unexpected error occurred. Please try again.";
}
```

### Validation Rules
```javascript
function validateSearchParameters(params) {
  const errors = [];
  
  // Date validation
  if (params.from && params.to) {
    const fromDate = new Date(params.from);
    const toDate = new Date(params.to);
    const now = new Date();
    
    if (fromDate >= toDate) {
      errors.push("Pickup time must be before return time");
    }
    
    if (fromDate < now) {
      errors.push("Pickup time must be in the future");
    }
  }
  
  // Location validation
  if (!params.city && !params.lat && !params.postcode) {
    errors.push("Location is required (city, postcode, or coordinates)");
  }
  
  return errors;
}
```

This comprehensive audit provides everything needed for AI chatbot integration with the Tashus vehicle search and details APIs, including practical examples, error handling, and natural language processing patterns.