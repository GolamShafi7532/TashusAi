# Tashus Vehicle Search & Details API Audit

## Overview

This document provides comprehensive documentation for integrating AI agents with Tashus vehicle search and details APIs. It covers two main endpoints:
1. **Vehicle Search API** - `/api/search/find-cars`
2. **Vehicle Details API** - `/api/search/find-cars/:listingId`

## 1. Vehicle Search API

### **Endpoint**
```
GET /api/search/find-cars
```

### **Purpose**
Search for available vehicles based on location, dates, and various filter criteria. Returns paginated results with vehicle information, pricing, and availability status.

### **Query Parameters**

#### **Location Parameters (Required)**
```typescript
// Primary location identifiers (use any combination)
city?: string          // City name (e.g., "Sydney", "Melbourne")
country?: string       // Country short code (e.g., "au" for Australia)  
region?: string        // State/region short code (e.g., "nsw", "vic")
postcode?: string      // Postal code (e.g., "2000", "3000")

// Coordinates for geo-proximity search
lat?: string          // Latitude (-33.866275)
long?: string         // Longitude (151.21310699999998)
```

#### **Date/Time Parameters (Optional)**
```typescript
from?: string         // Pickup datetime (ISO format: "2024-02-15T10:00:00.000Z")
to?: string          // Return datetime (ISO format: "2024-02-18T10:00:00.000Z")
currentDateTime?: string // Current time for availability calculation
```

#### **Vehicle Filter Parameters (Optional)**
```typescript
cType?: string        // Car type filter (SUV, Sedan, Hatchback, etc.)
fType?: string        // Fuel type filter (Petrol, Diesel, Electric, Hybrid)
year?: number         // Manufacturing year (2020, 2021, etc.)
color?: string        // Vehicle color (Red, Blue, White, etc.)
tType?: string        // Transmission type (Manual, Automatic)
mileage?: string      // Odometer reading (currently not implemented)
```

#### **Pagination Parameters (Optional)**
```typescript
page?: string         // Page number (default: "1")
pageSize?: string     // Results per page (default: "10")
```

### **Request Example**
```javascript
// Basic search by city and dates
GET /api/search/find-cars?city=Sydney&country=au&region=nsw&from=2024-02-15T10:00:00.000Z&to=2024-02-18T10:00:00.000Z

// Advanced search with filters
GET /api/search/find-cars?city=Melbourne&country=au&cType=SUV&fType=Petrol&tType=Automatic&year=2022&page=1&pageSize=20

// Geo-proximity search
GET /api/search/find-cars?lat=-33.866275&long=151.213107&from=2024-02-15T10:00:00.000Z&to=2024-02-18T10:00:00.000Z
```

### **Response Format**
```typescript
{
  totalDocuments: number;        // Total vehicles in database
  totalDataSize: number;         // Data size in bytes (currently 0)
  currentPage: number;           // Current page number
  pageSize: number;              // Results per page
  resultCount: number;           // Results in current response
  results: VehicleSearchResult[] // Array of vehicle objects
}
```

### **Vehicle Search Result Schema**
```typescript
interface VehicleSearchResult {
  _id: string;                   // MongoDB ObjectId
  listingId: number;             // Unique vehicle listing ID
  hostId: string;                // Vehicle owner ID
  
  // Vehicle basic info
  car: {
    make: string;                // Toyota, Honda, Ford, etc.
    model: string;               // Camry, Civic, Ranger, etc.
    transmissionType: string;    // "Manual" | "Automatic"
    seats: number;               // 2, 4, 5, 7, 8, etc.
    carType: string;             // "SUV" | "Sedan" | "Hatchback" | "Ute" | etc.
    fuelType: string;            // "Petrol" | "Diesel" | "Electric" | "Hybrid"
  };
  
  carNickName: string;           // Owner's custom name for vehicle
  
  // Location information
  location: {
    pickupAddress: {
      street: string;
      city: string;
      state: string;
      country: string;
      postalCode: string;
      stateShortCode: string;
      countryShortCode: string;
      coordinates: [number, number]; // [longitude, latitude]
    }
  };
  
  // Pricing information
  rates: {
    hourlyRates: {
      currency: string;          // "AUD"
      amount: number;            // Price per hour
    };
    dailyRates: {
      currency: string;          // "AUD"  
      amount: number;            // Price per day
    }
  };
  
  // Media
  photos: {
    coverPhoto: {
      imageInfo: {
        public_id: string;       // Cloudinary public ID
        secure_url: string;      // Image URL
        format: string;          // "jpg", "png", etc.
      };
      storageProvider?: string;  // "cloudinary"
    }
  };
  
  // Availability rules (for advanced filtering)
  availability: {
    pickupReturnHour: {
      alwaysAvailable: boolean;
      customAvailability: Array<{
        dayOfWeek: string;       // "mon", "tue", "wed", etc.
        allDay: boolean;
        availability: string;    // "always" | "never" | "custom"
        customHours: Array<{
          startTime: Date;
          endTime: Date;
          status: string;        // "booked" | "reserved" | "free"
        }>
      }>
    };
    noticeInAdvance: {
      alwaysAvailableImmediately: boolean;
      hoursRequired: number;     // Hours of advance notice required
    };
    minTripDuration: {
      noMinimum: boolean;
      unit: string;              // "hours" | "days" | "weeks"
      shortestDuration: number;
    };
    maxTripDuration: {
      noMaximum: boolean;
      unit: string;              // "days" | "weeks"
      longestDuration: number;
    }
  };
  
  // Business metrics
  totalTrips: number;            // Total completed trips
  ratingsReceivedFrom: number;   // Number of ratings received
  totalRatings: number;          // Total rating points
  
  // Computed fields (when dates provided)
  isNoticeHourRequired?: boolean; // Whether advance notice is needed
}
```

## 2. Vehicle Details API

### **Endpoint**
```
GET /api/search/find-cars/:listingId
```

### **Purpose**
Retrieve comprehensive details for a specific vehicle including host information, complete availability rules, pricing, photos, and guidelines.

### **Path Parameters**
```typescript
listingId: string | number  // Vehicle listing ID (e.g., "1234")
```

### **Request Example**
```javascript
GET /api/search/find-cars/1234
```

### **Response Schema**
```typescript
interface VehicleDetails {
  _id: string;
  listingId: number;
  hostId: string;
  listingStatus: string;       // "listed" | "pending" | "unlisted"
  
  // Complete vehicle information
  car: {
    vin: string;               // Vehicle Identification Number
    make: string;
    model: string;
    year: number;
    color: string;
    carType: string;
    seats: number;
    doors: number;
    windows: number;
    fuelType: string;
    transmissionType: string;
    trim: string;
    mileage: {
      distance: number;
      units: string;           // "km" | "miles"
    }
  };
  
  carNickName: string;
  features: string[];          // Vehicle features array
  additionalFeatures: string[];
  
  additionalInfos: {
    carDescription: string;    // HTML description
    guidelines: string;        // Usage guidelines
  };
  
  vehicleObligations: {
    neverWrittenOff: boolean;
    ctpInsurance: boolean;
  };
  
  // Complete location details
  location: {
    pickupAddress: {
      street: string;
      city: string;
      state: string;
      country: string;
      postalCode: string;
      stateShortCode: string;
      countryShortCode: string;
      coordinates: [number, number];
    };
    parkingInstructions: string;
  };
  
  // Detailed availability rules
  availability: {
    // Same as search result but complete
  };
  
  // Complete pricing structure
  rates: {
    hourlyRates: { currency: string; amount: number };
    dailyRates: { currency: string; amount: number };
    
    // Discount structures
    peakIncrease: Array<{
      increaseType: string;      // "amount" | "percentage"
      increaseAmount: number;
      increaseDays: string[];    // Days when peak pricing applies
    }>;
    
    longBookingDiscounts: Array<{
      duration: number;
      unit: string;              // "days" | "weeks"
      discountType: string;      // "amount" | "percentage"
      discountAmount: number;
    }>;
    
    advanceBookingDiscounts: Array<{
      advanceDays: number;
      discountType: string;
      discountAmount: number;
    }>;
    
    customPricing: Array<{
      startDate: Date;
      endDate: Date;
      hourlyRate: number;
      dailyRate: number;
    }>;
  };
  
  // Host information
  hostInfo: {
    userId: string;
    username?: string;
    firstName: string;
    lastName: string;
    profileSummary?: {
      partner?: string;
      guest?: string;
    };
    picture?: {
      imageInfo: {
        public_id: string;
        secure_url: string;
        format: string;
      }
    };
    createdAt: Date;           // Join date
    hostTotalTrips: number;
    hostRatingCount: number;
    hostRatingTotal: number;
  };
  
  // Complete photo gallery
  photos: {
    coverPhoto: { imageInfo: { /* ... */ } };
    initialConditionPhotos: Array<{ imageInfo: { /* ... */ } }>;
    additionalPhotos: Array<{ imageInfo: { /* ... */ } }>;
    vehicleInspectionPhotos: Array<{ imageInfo: { /* ... */ } }>;
  };
  
  // Usage restrictions
  distance: {
    unlimitedTravel: boolean;
    maximumDailyDistance?: number;     // km per day limit
    additionalFeePerKilometer?: number; // Extra fee per km
  };
  
  // Guidelines and instructions
  guidelines: {
    pickupInformation: string;
    returnInformation: string;
    wordOfWelcome: string;
    firstPointOfContactIsMe: boolean;
  };
  
  // Business metrics
  totalTrips: number;
  ratingsReceivedFrom: number;
  totalRatings: number;
  
  createdAt: string;
  updatedAt: string;
}
```

## 3. Frontend Filtering Logic

### **Available Filter Categories**

#### **Price Filter**
```typescript
// Dual range filtering (both hourly and daily rates)
priceFilter = {
  name: "price",
  options: {
    dayPriceRange: [minDailyPrice, maxDailyPrice],    // e.g., [50, 200]
    hourPriceRange: [minHourlyPrice, maxHourlyPrice]  // e.g., [8, 30]
  }
}

// Implementation: filterByPrice()
// Logic: Vehicle passes if EITHER daily OR hourly rate is within range
// If both ranges specified: vehicle must pass BOTH filters
```

#### **Car Type Filter**
```typescript
// Multiple selection filter
carTypeFilter = {
  name: "carType", 
  options: ["SUV", "Sedan", "Hatchback", "Ute", "Van", "Convertible"]
}

// Implementation: filterByCarType()
// Logic: Vehicle car.carType must be in selected array
```

#### **Transmission Filter**
```typescript
// Multiple selection filter
transmissionFilter = {
  name: "transmission",
  options: ["Manual", "Automatic"]  
}

// Implementation: filterByTransmissionType()
// Logic: Vehicle car.transmissionType must be in selected array
```

#### **Seat Count Filter** 
```typescript
// Minimum seat filter
seatFilter = {
  name: "seat",
  options: "5"  // Minimum number of seats required
}

// Implementation: filterBySeats() 
// Logic: Vehicle car.seats >= parseInt(selectedMinSeats)
```

### **Filter Application Logic**
```javascript
// Frontend applies filters in this sequence:
1. Start with availableCarList (vehicles passing date/availability check)
2. Apply carType filter (if selected)
3. Apply price filter (if selected) 
4. Apply transmission filter (if selected)
5. Apply seat filter (if selected)
6. Result becomes filteredCarList for display
```

## 4. AI Agent Integration Guidelines

### **Search Query Construction**

#### **Basic Vehicle Search**
```javascript
// For: "Find SUVs in Sydney for next weekend"
const searchParams = {
  city: "Sydney",
  country: "au", 
  region: "nsw",
  cType: "SUV",
  from: "2024-02-17T10:00:00.000Z", // Next Saturday 10 AM
  to: "2024-02-18T18:00:00.000Z"    // Next Sunday 6 PM
};

const response = await fetch(`/api/search/find-cars?${new URLSearchParams(searchParams)}`);
```

#### **Advanced Filtered Search**
```javascript
// For: "Show me automatic petrol cars under $100/day in Melbourne"
const searchParams = {
  city: "Melbourne",
  country: "au",
  region: "vic", 
  tType: "Automatic",
  fType: "Petrol",
  from: "2024-02-15T09:00:00.000Z",
  to: "2024-02-20T17:00:00.000Z"
};

// Note: Price filtering happens on frontend, not in API
// Agent would need to filter results where dailyRates.amount <= 100
```

### **Natural Language to API Mapping**

#### **Location Mapping**
```javascript
const locationMap = {
  "Sydney": { city: "Sydney", region: "nsw", country: "au" },
  "Melbourne": { city: "Melbourne", region: "vic", country: "au" },
  "Brisbane": { city: "Brisbane", region: "qld", country: "au" },
  "Perth": { city: "Perth", region: "wa", country: "au" },
  "Adelaide": { city: "Adelaide", region: "sa", country: "au" },
  "NSW": { region: "nsw", country: "au" },
  "Victoria": { region: "vic", country: "au" }
};
```

#### **Vehicle Type Mapping**
```javascript
const vehicleTypeMap = {
  "SUV": "SUV",
  "4WD": "SUV", 
  "sedan": "Sedan",
  "hatchback": "Hatchback",
  "ute": "Ute",
  "truck": "Ute",
  "van": "Van",
  "convertible": "Convertible",
  "sports car": "Coupe"
};
```

#### **Fuel Type Mapping**
```javascript
const fuelTypeMap = {
  "petrol": "Petrol",
  "gasoline": "Petrol",
  "diesel": "Diesel", 
  "electric": "Electric",
  "EV": "Electric",
  "hybrid": "Hybrid"
};
```

#### **Transmission Mapping**
```javascript
const transmissionMap = {
  "automatic": "Automatic",
  "auto": "Automatic",
  "manual": "Manual"
};
```

### **Date/Time Processing**

#### **Natural Language Date Parsing**
```javascript
// Examples of date interpretations:
"tomorrow" → dayjs().add(1, 'day')
"next Friday" → dayjs().day(5).add(1, 'week') 
"this weekend" → [dayjs().day(6), dayjs().day(7)]
"for 3 days" → [startDate, dayjs(startDate).add(3, 'days')]
"from March 15 to March 18" → [dayjs('2024-03-15'), dayjs('2024-03-18')]

// Default times if not specified:
pickup: "10:00:00.000Z"  // 10 AM
return: "18:00:00.000Z"  // 6 PM
```

### **Response Processing for AI**

#### **Extract Key Information**
```javascript
function processSearchResults(response) {
  return response.results.map(vehicle => ({
    id: vehicle.listingId,
    name: `${vehicle.car.year} ${vehicle.car.make} ${vehicle.car.model}`,
    nickname: vehicle.carNickName,
    type: vehicle.car.carType,
    seats: vehicle.car.seats,
    transmission: vehicle.car.transmissionType,
    fuel: vehicle.car.fuelType,
    
    pricing: {
      hourly: vehicle.rates.hourlyRates.amount,
      daily: vehicle.rates.dailyRates.amount,
      currency: vehicle.rates.dailyRates.currency
    },
    
    location: {
      city: vehicle.location.pickupAddress.city,
      area: vehicle.location.pickupAddress.street,
      postcode: vehicle.location.pickupAddress.postalCode
    },
    
    image: vehicle.photos.coverPhoto.imageInfo.secure_url,
    
    availability: {
      noticeRequired: vehicle.isNoticeHourRequired || false,
      advanceHours: vehicle.availability.noticeInAdvance.hoursRequired
    },
    
    host: {
      trips: vehicle.totalTrips,
      rating: vehicle.totalRatings > 0 ? 
        (vehicle.totalRatings / vehicle.ratingsReceivedFrom).toFixed(1) : null
    }
  }));
}
```

### **Error Handling**

#### **Common API Errors**
```javascript
// Invalid date range
{
  "error": "Invalid Date Range",
  "message": "The provided From date must be before the To date."
}

// Past dates
{
  "error": "Invalid Dates", 
  "message": "Dates should be greater than the current date."
}

// Vehicle not found
{
  "status": 204,
  "message": "No car listing found."
}

// Server error
{
  "error": "Internal server error",
  "message": "Database connection failed"
}
```

### **Performance Optimization**

#### **Pagination Strategy**
```javascript
// For AI responses, use smaller page sizes for faster responses
const defaultPageSize = 10;  // Quick results for chat
const maxPageSize = 50;      // Maximum for comprehensive searches

// Request only essential data for initial response
// Follow up with details API for selected vehicles
```

#### **Caching Strategy**
```javascript
// Cache search results for common queries
const cacheKey = `search_${city}_${carType}_${dateRange}`;
const cacheDuration = 5 * 60 * 1000; // 5 minutes

// Cache vehicle details for repeat requests  
const detailsCacheKey = `vehicle_${listingId}`;
const detailsCacheDuration = 15 * 60 * 1000; // 15 minutes
```

## 5. Sample AI Agent Implementation

```javascript
class TashusVehicleSearchAgent {
  
  async searchVehicles(userQuery) {
    // 1. Parse natural language query
    const intent = this.parseSearchIntent(userQuery);
    
    // 2. Build API parameters
    const searchParams = this.buildSearchParams(intent);
    
    // 3. Call search API
    const response = await this.callSearchAPI(searchParams);
    
    // 4. Process and format results
    const formattedResults = this.formatResultsForUser(response);
    
    // 5. Generate natural language response
    return this.generateResponse(formattedResults, intent);
  }
  
  parseSearchIntent(query) {
    return {
      location: this.extractLocation(query),
      dates: this.extractDates(query), 
      vehicleType: this.extractVehicleType(query),
      transmission: this.extractTransmission(query),
      fuelType: this.extractFuelType(query),
      priceRange: this.extractPriceRange(query),
      seatCount: this.extractSeatCount(query)
    };
  }
  
  async getVehicleDetails(listingId) {
    const response = await fetch(`/api/search/find-cars/${listingId}`);
    return this.formatVehicleDetails(await response.json());
  }
}
```

This comprehensive audit provides all necessary information for AI agents to effectively query the Tashus vehicle search and details APIs, interpret results, and provide intelligent responses to user queries about vehicle availability and characteristics.