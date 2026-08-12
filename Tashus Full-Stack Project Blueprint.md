# Tashus Full-Stack Project Blueprint

## 1. Directory Structure Map

### Frontend Architecture (Next.js 14)

### Backend Architecture (Node.js + Express)

```
tashus-Backend-v1/
├── prisma/
│   ├── schema.prisma              # Database schema definitions
│   └── generated/                 # Generated Prisma client
├── src/
│   ├── app.ts                     # Express app configuration
│   ├── server.ts                  # Server entry point
│   ├── modules/                   # Business logic modules
│   │   ├── auth/                  # Authentication & authorization
│   │   ├── carListing/           # Vehicle management
│   │   │   ├── controllers/      # Route handlers
│   │   │   ├── services/         # Business logic
│   │   │   └── carListing.routes.ts
│   │   ├── reservation/          # Booking management
│   │   │   ├── controllers/      # Reservation & travel controllers
│   │   │   ├── services/         # Business logic
│   │   │   └── reservation.routes.ts
│   │   ├── voucher/              # Voucher & promotion system
│   │   │   ├── controllers/      # Voucher validation
│   │   │   ├── services/         # Rule engine logic
│   │   │   └── voucher.routes.ts
│   │   ├── payment/              # Payment processing
│   │   ├── search/               # Vehicle search engine
│   │   ├── userProfile/          # User management
│   │   └── admin/                # Admin operations
│   ├── middleware/               # Express middleware
│   │   ├── auth.middleware.ts    # JWT authentication
│   │   ├── rateLimiter.middleware.ts # Rate limiting
│   │   └── error.middleware.ts   # Error handling
│   ├── config/                   # Configuration files
│   └── shared/                   # Shared utilities
```

### Backend Integration Points

**Database Architecture**
- Primary: PostgreSQL (via Prisma ORM)
- Secondary: MongoDB (legacy data via Mongoose)
- Real-time: Ably channels for live updates
- Payment: Stripe webhooks integration

**Authentication System**
- JWT token-based authentication
- Session management via PostgreSQL
- Role-based access control (user/admin)
- Multi-device session tracking

## 2. Database Schema & Data Models

### PostgreSQL Schema (Prisma)

#### User Verification System
```sql
-- User verification tracking with granular status per verification type
CREATE TABLE user_verifications (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                      VARCHAR UNIQUE NOT NULL,
  
  -- Email & Phone verification
  is_email_verified            BOOLEAN,
  is_phone_verified            BOOLEAN,
  final_verification_status    verification_status,
  
  -- Driving license verification stages
  driving_license_status       verification_status,
  driving_license_verified_at  TIMESTAMP,
  driving_license_expires_at   TIMESTAMP,
  
  -- License photo verification
  driving_license_photo_status    verification_status,
  driving_license_photo_verified_at TIMESTAMP,
  
  -- License with face verification
  driving_license_face_status     verification_status,
  driving_license_face_verified_at TIMESTAMP,
  
  -- Profile photo verification
  profile_photo_status         verification_status,
  profile_photo_verified_at    TIMESTAMP,
  
  -- Secondary ID verification
  secondary_id_status          verification_status,
  secondary_id_verified_at     TIMESTAMP,
  
  -- Address verification
  residential_address_status   verification_status,
  residential_address_verified_at TIMESTAMP,
  
  created_at                   TIMESTAMP DEFAULT now(),
  updated_at                   TIMESTAMP DEFAULT now()
);

-- Verification status enum
CREATE TYPE verification_status AS ENUM (
  'pending',      -- Waiting for review
  'approved',     -- Successfully approved
  'declined',     -- Declined after review
  'awaiting',     -- Awaiting further action
  'resubmitted',  -- Resubmitted after changes
  'needs_update', -- Requires updates
  'expired'       -- Verification expired
);
```

#### Session Management System
```sql
CREATE TABLE sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        VARCHAR NOT NULL,
  token          VARCHAR,
  expires        TIMESTAMP NOT NULL,
  ip_address     VARCHAR,
  user_agent     VARCHAR,
  is_revoked     BOOLEAN DEFAULT false,
  token_version  INTEGER DEFAULT 0,
  status         session_status DEFAULT 'ACTIVE',
  note           VARCHAR,  -- Login/logout messages
  last_activity  TIMESTAMP DEFAULT now(),
  created_at     TIMESTAMP DEFAULT now(),
  updated_at     TIMESTAMP DEFAULT now()
);

CREATE TYPE session_status AS ENUM (
  'ACTIVE',     -- Valid session
  'LOGGED_OUT', -- Explicitly logged out
  'EXPIRED',    -- Timed out
  'REVOKED'     -- Forcefully terminated
);
```

#### Payment & Transaction System
```sql
CREATE TABLE payments (
  payment_id              BIGSERIAL PRIMARY KEY,
  reservation_id          INTEGER,     -- Links to MongoDB reservation
  revised_reservation_id  VARCHAR,     -- Revised reservation reference
  user_id                VARCHAR NOT NULL,
  fee_id                 VARCHAR,     -- Additional fee reference
  
  -- Payment amounts
  amount                 DECIMAL(12,2) NOT NULL,
  card_amount            DECIMAL(12,2) DEFAULT 0,
  voucher_amount         DECIMAL(12,2) DEFAULT 0,
  credit_amount          DECIMAL(12,2) DEFAULT 0,
  current_credit         DECIMAL(12,2) DEFAULT 0,
  
  -- Payment details
  payment_method         payment_method DEFAULT 'card',
  transaction_type       transaction_type DEFAULT 'payment',
  voucher_code           VARCHAR(50),
  credit_source          credit_source,
  
  -- Status & references
  payment_status         payment_status DEFAULT 'completed',
  external_reference_id  VARCHAR(100),  -- Stripe/gateway ID
  description            TEXT,
  
  -- Metadata & audit
  admin_id               VARCHAR,
  metadata               JSON,
  payment_date          TIMESTAMPTZ DEFAULT now(),
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- Payment enums
CREATE TYPE payment_method AS ENUM (
  'card', 'voucher', 'credit', 'bank', 'cash', 'paypal', 'other', 'mixed', 'eftpos'
);

CREATE TYPE payment_status AS ENUM (
  'pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled'
);

CREATE TYPE transaction_type AS ENUM (
  'payment', 'refund', 'credit', 'adjustment'
);
```

#### Toll Transaction System
```sql
CREATE TABLE toll_transactions (
  id                   BIGSERIAL PRIMARY KEY,
  reservation_id       INTEGER,
  vehicle_license_plate VARCHAR(50) NOT NULL,
  start_date           TIMESTAMP NOT NULL,
  end_date             TIMESTAMP NOT NULL,
  toll_details         VARCHAR(200),
  vehicle_class_code   INTEGER,
  trip_cost           DECIMAL(12,2) NOT NULL,
  processing_fee      DECIMAL(12,2) NOT NULL,
  status              VARCHAR(20),
  created_at          TIMESTAMP DEFAULT now(),
  updated_at          TIMESTAMP DEFAULT now()
);
```

### MongoDB Schema (Legacy/Primary Business Data)

#### Vehicle Inventory Collection
```javascript
// CarListing Collection
{
  _id: ObjectId,
  listingId: Number,           // Auto-incremented unique ID
  hostId: String,              // Owner reference
  listingStatus: String,       // "draft" | "pending" | "listed" | "unlisted"
  
  // Vehicle core data
  car: {
    vin: String,               // Vehicle Identification Number
    make: String,              // Toyota, Honda, Ford, etc.
    model: String,             // Camry, Civic, F-150, etc.
    year: Number,              // Manufacturing year
    color: String,             // Vehicle color
    carType: String,           // SUV, Sedan, Hatchback, Truck, etc.
    seats: Number,             // Seating capacity
    doors: Number,             // Number of doors
    fuelType: String,          // Petrol, Diesel, Electric, Hybrid
    transmissionType: String,  // Manual, Automatic
    mileage: {
      distance: Number,
      units: String            // "km" | "miles"
    }
  },
  
  // Location & accessibility
  location: {
    pickupAddress: {
      street: String,
      city: String,
      state: String,
      country: String,
      postalCode: String,
      stateShortCode: String,
      countryShortCode: String,
      coordinates: [Number, Number] // [longitude, latitude]
    },
    parkingInstructions: String
  },
  
  // Availability rules
  availability: {
    pickupReturnHour: {
      alwaysAvailable: Boolean,
      customAvailability: [{
        dayOfWeek: String,       // "mon", "tue", "wed", etc.
        allDay: Boolean,
        availability: String,    // "always" | "never" | "custom"
        customHours: [{
          startTime: Date,
          endTime: Date,
          status: String         // "booked" | "reserved" | "free"
        }]
      }]
    },
    noticeInAdvance: {
      alwaysAvailableImmediately: Boolean,
      hoursRequired: Number      // 1-24 hours advance notice
    },
    minTripDuration: {
      noMinimum: Boolean,
      unit: String,              // "hours" | "days" | "weeks"
      shortestDuration: Number
    },
    maxTripDuration: {
      noMaximum: Boolean,
      unit: String,              // "days" | "weeks"
      longestDuration: Number
    }
  },
  
  // Pricing structure
  rates: {
    hourlyRates: { currency: String, amount: Number },
    dailyRates: { currency: String, amount: Number },
    peakIncrease: [{
      increaseType: String,      // "amount" | "percentage"
      increaseAmount: Number,
      increaseDays: [String]     // Days when peak pricing applies
    }],
    longBookingDiscounts: [{
      duration: Number,
      unit: String,              // "days" | "weeks"
      discountType: String,      // "amount" | "percentage"
      discountAmount: Number
    }],
    advanceBookingDiscounts: [{
      advanceDays: Number,
      discountType: String,
      discountAmount: Number
    }],
    customPricing: [{
      startDate: Date,
      endDate: Date,
      hourlyRate: Number,
      dailyRate: Number
    }]
  },
  
  // Media & documentation
  photos: {
    coverPhoto: {
      imageInfo: {
        public_id: String,
        secure_url: String,
        format: String
      },
      storageProvider: String
    },
    initialConditionPhotos: [/* same structure */],
    additionalPhotos: [/* same structure */],
    vehicleInspectionPhotos: [/* same structure */]
  },
  
  // Business metrics
  totalTrips: Number,
  ratingsReceivedFrom: Number,
  totalRatings: Number,
  
  // Timestamps
  createdAt: Date,
  updatedAt: Date
}
```

#### Reservation Management Collection
```javascript
// Reservation Collection
{
  _id: ObjectId,
  reservationId: Number,       // Auto-incremented unique ID
  listingId: Number,           // Links to vehicle
  guestId: String,             // Renter user ID
  hostId: String,              // Vehicle owner ID
  
  // Rental period
  pickupTime: Date,            // Trip start datetime
  returnTime: Date,            // Trip end datetime
  reservationDuration: String, // Human-readable duration
  
  // Status tracking
  reservationStatus: String,   // "pending" | "confirmed" | "cancelled" | "completed"
  paymentStatus: String,       // "pending" | "paid" | "refunded" | "refundable"
  
  // Pricing breakdown
  totalPrice: Number,          // Final total amount
  durationPrice: Number,       // Base rental cost
  serviceFeeAmount: Number,    // Platform fee
  
  // Applied discounts
  discounts: {
    longBookingDiscounts: {
      calculatedAmount: Number,
      text: String,
      percentage: Number
    },
    advanceBookingDiscounts: {
      calculatedAmount: Number,
      text: String,
      percentage: Number
    }
  },
  
  // Peak pricing adjustments
  peakIncrease: {
    calculatedAmount: Number,
    increaseType: String,      // "amount" | "percentage"
    increaseAmount: Number,
    increaseDays: [String]
  },
  
  // Custom pricing overrides
  customPricing: [{
    date: Date,
    hourlyRate: Number,
    dailyRate: Number,
    appliedRate: Number
  }],
  
  // Delivery service
  deliveryDetails: {
    isDeliveryEnabled: Boolean,
    isReturnEnabled: Boolean,
    deliveryVehicle: {
      pickupLocation: {
        address: String,
        coordinates: [Number, Number]
      },
      deliveryLocation: {
        address: String,
        coordinates: [Number, Number]
      },
      distanceKm: Number,
      pricing: {
        deliveryTotalFee: Number
      }
    },
    totalDeliveryFee: Number,
    totalReturnFee: Number
  },
  
  // Guest information
  guestVerificationInfo: {
    isEmailVerified: Boolean,
    isMobileVerified: Boolean,
    isLicenseVerified: Boolean,
    isProfilePhotoVerified: Boolean,
    isLicenseFaceVerified: Boolean,
    isAddressVerified: Boolean
  },
  
  // Additional drivers
  additionalDrivers: [{
    firstName: String,
    lastName: String,
    email: String,
    phoneNumber: String,
    licenseNumber: String,
    licenseState: String,
    isVerified: Boolean
  }],
  
  // Insurance coverage
  guestCoveragePackage: {
    coverageType: String,      // Coverage plan selected
    coveragePercentage: Number,
    excessFee: Number,
    premium: Number
  },
  
  // Applied vouchers & credits
  appliedVoucherInfo: {
    voucherId: String,
    voucherCode: String,
    discountAmount: Number,
    discountType: String       // "percentage" | "amount"
  },
  
  appliedCreditInfo: {
    deductedCreditAmount: Number,
    isDepositCoveredByCredit: Boolean
  },
  
  // Travel state tracking
  travelStartTime: Date,
  travelEndTime: Date,
  travelStartPhotos: [/* photo objects */],
  travelEndPhotos: [/* photo objects */],
  
  createdAt: Date,
  updatedAt: Date
}
```

#### Voucher & Promotion System
```javascript
// Promotion Collection (Campaign level)
{
  _id: ObjectId,
  title: String,               // Campaign name
  description: String,
  totalBudget: Number,         // Total campaign budget
  remainingBudget: Number,     // Available budget
  
  // Campaign rules (applied to all vouchers)
  promotionRules: [{
    id: String,
    field: String,             // "carType", "reservationDuration", etc.
    operator: String,          // "eq", "gt", "lt", "in", "between"
    valueSource: String,
    value: Mixed               // Rule value (string, number, array)
  }],
  
  expiresAt: Date,
  isExpired: Boolean,
  
  // Associated vouchers
  vouchers: [String],          // Array of voucher ObjectIds
  
  // Audit trail
  createdBy: String,           // Admin user ID
  updatedBy: [{
    adminId: String,
    updatedAt: Date
  }],
  changeLogs: [/* change records */],
  
  createdAt: Date,
  updatedAt: Date
}

// Voucher Collection (Individual codes)
{
  _id: ObjectId,
  promotionId: String,         // Links to parent promotion
  voucherCode: String,         // User-facing code (e.g. "SUMMER20")
  voucherSlug: String,         // URL-friendly identifier
  
  // Discount configuration
  discountType: String,        // "percentage" | "fixed_amount"
  discountAmount: Number,      // Discount value
  maxDiscountAmount: Number,   // Cap for percentage discounts
  
  // Usage controls
  maxUsageCount: Number,       // Total usage limit across all users
  maxUsagePerUser: Number,     // Per-user usage limit
  voucherUsageCount: Number,   // Current total usage
  voucherUsageAmount: Number,  // Total amount discounted
  
  // Status flags
  isActive: Boolean,           // Manually controlled active state
  isExpired: Boolean,          // Time-based expiry status
  isPaused: Boolean,           // Temporarily suspended
  isPublic: Boolean,           // Publicly discoverable vs private
  
  // Voucher-specific rules (inherit + override promotion rules)
  voucherRules: [{
    id: String,
    field: String,
    operator: String,
    valueSource: String,
    value: Mixed
  }],
  
  // Lifecycle dates
  expiresAt: Date,
  activateAt: Date,            // Optional delayed activation
  
  // Usage tracking
  voucherUsedBy: [{
    userId: String,
    amount: Number,            // Amount discounted for this use
    reservationId: Number,     // Which booking used this voucher
    usedAt: Date
  }],
  
  // Metadata
  voucherTitle: String,
  voucherImages: [{
    public_id: String,
    secure_url: String
  }],
  applicableUserDescription: String,
  voucherTerms: Mixed,
  
  // Audit
  creator: {
    adminUserName: String,
    adminId: String
  },
  changeLogs: [/* change history */],
  updatedBy: [/* update history */],
  
  createdAt: Date,
  updatedAt: Date
}
```

## 3. Backend Service Flows

### Vehicle Availability Validation Service

**Endpoint**: `GET /api/reservation/reservations-by-car/:carListingId`  
**Location**: `src/modules/reservation/reservation.routes.ts`

```typescript
// Service Layer Logic
class ReservationService {
  async validateVehicleAvailability(
    carListingId: number,
    pickupTime: Date,
    returnTime: Date
  ): Promise<AvailabilityResult> {
    
    // 1. Fetch existing reservations
    const existingReservations = await this.getActiveReservations(carListingId);
    
    // 2. Check custom block dates
    const blockDates = await this.getBlockedDates(carListingId);
    
    // 3. Validate against vehicle availability rules
    const vehicle = await this.getVehicleDetails(carListingId);
    const availabilityRules = vehicle.availability;
    
    // 4. Apply business rules validation
    return {
      isAvailable: boolean,
      conflictReason?: string,
      suggestedTimes?: Date[]
    };
  }
}
```

### Voucher Rule Engine Service

**Endpoint**: `POST /api/voucher/check-voucher-validity`  
**Location**: `src/modules/voucher/voucher.routes.ts`

```typescript
// Rule Engine Implementation
class VoucherValidationService {
  
  async validateVoucher(
    voucherCode: string,
    reservationData: ReservationData
  ): Promise<VoucherValidationResult> {
    
    // 1. Fetch voucher and promotion rules
    const voucher = await this.getVoucherByCode(voucherCode);
    const promotion = await this.getPromotionById(voucher.promotionId);
    
    // 2. Combine and evaluate all rules
    const allRules = [...promotion.promotionRules, ...voucher.voucherRules];
    
    // 3. Rule evaluation engine
    for (const rule of allRules) {
      const isValid = await this.evaluateRule(rule, reservationData);
      if (!isValid) {
        return {
          isValid: false,
          reason: `Rule failed: ${rule.field} ${rule.operator} ${rule.value}`
        };
      }
    }
    
    // 4. Usage limits validation
    const usageCheck = await this.validateUsageLimits(voucher, reservationData.userId);
    
    // 5. Calculate discount
    const discountAmount = this.calculateDiscount(voucher, reservationData.totalAmount);
    
    return {
      isValid: true,
      discountAmount,
      finalAmount: reservationData.totalAmount - discountAmount
    };
  }
  
  private async evaluateRule(rule: VoucherRule, data: ReservationData): Promise<boolean> {
    const fieldValue = this.extractFieldValue(rule.field, data);
    
    switch (rule.operator) {
      case 'eq': return fieldValue === rule.value;
      case 'gt': return fieldValue > rule.value;
      case 'lt': return fieldValue < rule.value;
      case 'in': return rule.value.includes(fieldValue);
      case 'between': 
        return fieldValue >= rule.value[0] && fieldValue <= rule.value[1];
      // ... more operators
    }
  }
}
```

### Reservation Creation Service

**Endpoint**: `POST /api/reservation/create`  
**Location**: `src/modules/reservation/reservation.routes.ts`

```typescript
// Reservation Creation Flow
class ReservationController {
  
  async handleNewReservation2(req: Request, res: Response) {
    
    // 1. Input validation & sanitization
    const reservationData = this.validateReservationRequest(req.body);
    
    // 2. Availability double-check (prevent race conditions)
    const availabilityCheck = await this.validateAvailability(reservationData);
    if (!availabilityCheck.isAvailable) {
      throw new ConflictError('Vehicle no longer available');
    }
    
    // 3. Voucher validation (if applied)
    if (reservationData.voucherCode) {
      const voucherResult = await this.validateVoucher(reservationData);
      reservationData.finalAmount -= voucherResult.discountAmount;
    }
    
    // 4. Payment processing
    const paymentResult = await this.processPayment(reservationData);
    
    // 5. Create reservation record
    const reservation = await this.createReservation({
      ...reservationData,
      paymentId: paymentResult.paymentId,
      reservationStatus: 'pending'
    });
    
    // 6. Update vehicle availability
    await this.updateVehicleAvailability(reservation);
    
    // 7. Send notifications
    await this.sendReservationNotifications(reservation);
    
    // 8. Log transaction in PostgreSQL
    await this.logPaymentTransaction(paymentResult, reservation);
    
    return res.status(201).json({
      success: true,
      reservationId: reservation.reservationId,
      totalAmount: reservation.totalPrice
    });
  }
}
```

### Real-time Updates Service

**Technology**: Ably Real-time Messaging  
**Location**: `src/app.ts`

```typescript
// Real-time notification system
export const ablyRealtime = new Ably.Realtime(environment.ABLY_CHANNEL_API_KEY);
export const ablyChannel = ablyRealtime.channels.get('reservations');

class NotificationService {
  
  async notifyReservationUpdate(reservationId: number, updateType: string) {
    
    // Publish to specific user channels
    await ablyChannel.publish(`reservation-${reservationId}`, {
      type: updateType,
      reservationId,
      timestamp: new Date().toISOString()
    });
    
    // Notify both guest and host
    const reservation = await this.getReservationById(reservationId);
    
    await Promise.all([
      this.sendUserNotification(reservation.guestId, updateType, reservationId),
      this.sendUserNotification(reservation.hostId, updateType, reservationId)
    ]);
  }
}
```

## 4. API Endpoint Catalog

### Authentication Endpoints
```
POST   /api/auth/login              # User login
POST   /api/auth/register           # User registration  
POST   /api/auth/refresh            # Token refresh
POST   /api/auth/logout             # User logout
PUT    /api/auth/forgot-password    # Password reset request
```

### Vehicle Management Endpoints
```
GET    /api/listing/drafted-car-list/:hostId        # Get user's draft vehicles
POST   /api/listing/car-details                     # Save vehicle details
PUT    /api/listing/features-description/:listingId # Update features
PUT    /api/listing/pickup-location/:listingId      # Update location
PUT    /api/listing/availability/:listingId         # Update availability
PUT    /api/listing/rates/:listingId                # Update pricing
PUT    /api/listing/guidelines/:listingId           # Update guidelines
POST   /api/listing/upload-single-cover/:listingId  # Upload cover photo
PUT    /api/listing/listing-status/:listingId       # Change listing status
```

### Search & Discovery Endpoints
```
GET    /api/search/vehicles          # Search available vehicles
GET    /api/search/filters           # Get available filters
GET    /api/search/locations         # Location autocomplete
```

### Reservation Management Endpoints
```
POST   /api/reservation/create                        # Create new booking
GET    /api/reservation/find/:reservationId           # Get reservation details
GET    /api/reservation/find-guest-travels/:guestId   # Guest's bookings
GET    /api/reservation/find-partner-reservations/:hostId # Host's reservations
PUT    /api/reservation/travel-start/:reservationId   # Start trip
PUT    /api/reservation/travel-end-by-guest/:reservationId # End trip
PUT    /api/reservation/travel-cancel/:reservationId  # Cancel booking
GET    /api/reservation/reservations-by-car/:carListingId # Vehicle bookings (public)
```

### Voucher & Promotion Endpoints
```
POST   /api/voucher/check-voucher-validity    # Validate voucher code
POST   /api/voucher/find-best-voucher         # Find best applicable voucher
GET    /api/voucher/get-active-vouchers       # List active vouchers (public)
GET    /api/voucher/get-common-vouchers       # List public vouchers
POST   /api/voucher/get-vouchers/:userId      # User-specific vouchers

# Admin voucher management
POST   /api/voucher/admin/create-promotion           # Create promotion campaign
PUT    /api/voucher/admin/update-promotion/:promotionId # Update promotion
POST   /api/voucher/admin/create-voucher-promotion   # Create voucher
PUT    /api/voucher/admin/update-voucher/:voucherId  # Update voucher
GET    /api/voucher/admin/get-active-promotions      # List active promotions
GET    /api/voucher/admin/get-active-vouchers/:promotionId # List vouchers
```

### Payment Processing Endpoints
```
POST   /api/payment/create-payment-intent     # Create Stripe payment intent
POST   /api/payment/process-payment           # Process payment
POST   /api/payment/refund                    # Process refund
GET    /api/payment/payment-history/:userId   # Payment history
POST   /webhook                              # Stripe webhook handler
```

### User Profile Endpoints  
```
GET    /api/profile/user-info/:userId         # Get user profile
PUT    /api/profile/update-profile            # Update profile
GET    /api/profile/verification-status       # Verification status
POST   /api/profile/upload-document           # Upload verification document
```

## 5. Technology Stack & Infrastructure

### Backend Stack
- **Runtime**: Node.js + TypeScript (strict mode)
- **Framework**: Express.js with middleware
- **Databases**: 
  - PostgreSQL (Prisma ORM) - User management, payments, sessions
  - MongoDB (Mongoose) - Business data, vehicles, reservations
- **Authentication**: JWT tokens with session tracking
- **Real-time**: Ably real-time messaging
- **Payment**: Stripe integration with webhooks
- **File Storage**: Cloudinary for images
- **Logging**: Winston + Pino with MongoDB storage
- **Monitoring**: Sentry error tracking
- **Rate Limiting**: Express rate limiter
- **Validation**: Joi schema validation
- **API Documentation**: Swagger/OpenAPI

### DevOps & Deployment
- **Package Manager**: npm
- **Build Tool**: TypeScript compiler + tsc-alias
- **Process Manager**: Production deployment scripts
- **Environment**: Vercel serverless deployment
- **Database Migrations**: Prisma migrations
- **Testing**: Jest test framework
- **Code Quality**: ESLint + Prettier + Husky hooks

### Security Measures
```typescript
// Middleware stack
app.use(helmet());                    // Security headers
app.use(compression());               // Response compression
app.use(cors(corsOptions));          // CORS configuration
app.use(generalLimiter);             // Rate limiting
app.use('/api/auth', authLimiter);   // Stricter auth limits
app.use(errorMiddleware);            // Centralized error handling
```

### Real-time Architecture
```typescript
// Ably integration for live updates
export const ablyRealtime = new Ably.Realtime(apiKey);
export const ablyChannel = ablyRealtime.channels.get('reservations');

// Channel-based communication
- reservation-updates     // Booking status changes
- vehicle-availability    // Real-time availability updates  
- payment-notifications   // Payment completion alerts
- admin-dashboard        // Admin real-time monitoring
```

This comprehensive blueprint captures both frontend and backend architectures, providing complete visibility into the Tashus vehicle rental platform's technical infrastructure, data flows, and business logic implementation.

```
src/
├── app/                          # Next.js App Router pages
│   ├── api/                      # API routes (if any)
│   ├── car-listing/              # Vehicle listing pages
│   ├── search/                   # Vehicle search pages
│   ├── dashboard/                # User dashboard
│   ├── payment/                  # Payment processing pages
│   └── promotion/                # Voucher/promotion pages
├── components/                   # React components
│   └── Search/
│       └── ReservationCheckout/  # Main booking flow component
├── context/                      # React Context providers
│   ├── SearchProvider.tsx       # Core booking state management
│   ├── CarListingProvider.tsx   # Vehicle listing state
│   └── ProfileInfoProvider.tsx  # User profile state
├── hooks/                        # Custom React hooks
│   ├── useCarListing.tsx        # Vehicle listing operations
│   └── car-search/              # Search-related hooks
├── types/                        # TypeScript type definitions
│   ├── car-listing/             # Vehicle data models
│   ├── voucher-promotion/       # Voucher/promotion models
│   ├── checkout/                # Booking checkout models
│   ├── reservations/            # Reservation data models
│   └── vehicle-delivery/        # Delivery service models
└── utils/                        # Utility functions
    ├── Functions/               # Business logic functions
    └── configs/                 # Configuration files
        └── axiosInstance.ts     # API client configuration
```

### Frontend Integration Points

**API Base URL Configuration**

### Backend Integration Points

### Frontend Source Architecture
- Primary: `process.env.NEXT_PUBLIC_API_URL`
- Secondary: `process.env.NEXT_PUBLIC_API_URL_V2`

**Authentication Flow**
- JWT tokens stored in localStorage under 'tashus' key
- Automatic token injection via Axios interceptors
- 401 error handling with automatic redirect to login

## 2. Database Schema & Data Models

### Vehicle Inventory Models

#### Core Vehicle Data Structure (`CarDataState`)
```typescript
interface CarDataState {
  _id: string;                          // MongoDB ObjectId
  hostId: string;                       // Owner/host identifier
  listingId: number;                    // Unique listing number
  listingStatus: CarListingStatusValues; // Draft, pending, listed, unlisted, etc.
  
  // Vehicle Information
  car: {
    vin: string;                        // Vehicle Identification Number
    make: string;                       // Manufacturer (Toyota, Honda, etc.)
    model: string;                      // Vehicle model
    year: number;                       // Manufacturing year
    color: string;                      // Vehicle color
    carType: string;                    // SUV, Sedan, Hatchback, etc.
    seats: number;                      // Seating capacity
    doors: number;                      // Number of doors
    windows: number;                    // Number of windows
    fuelType: string;                   // Petrol, Diesel, Electric, Hybrid
    transmissionType: string;           // Manual, Automatic
    trim: string;                       // Vehicle trim level
    mileage: {
      distance: number;
      units: string;                    // km, miles
    }
  };
  
  // Location & Availability
  location: {
    pickupAddress: {
      street: string;
      city: string;
      state: string;
      country: string;
      postalCode: string;
      coordinates: [number, number];    // [longitude, latitude]
    };
    parkingInstructions: string;
  };
  
  // Pricing Structure
  rates: {
    hourlyRates: { currency: string; amount: number };
    dailyRates: { currency: string; amount: number };
    peakIncrease: CarDataPeakIncrease[];
    longBookingDiscounts: CarDataBookingDiscount[];
    advanceBookingDiscounts: CarDataBookingDiscount[];
    customPricing: CarDataCustomPricing[];
  };
  
  // Metadata
  totalTrips: number;
  ratingsReceivedFrom: number;
  totalRatings: number;
  createdAt: string;
  updatedAt: string;
}
```

#### Vehicle Availability Matrix (`CarDataAvailability`)
```typescript
interface CarDataAvailability {
  pickupReturnHour: {
    alwaysAvailable: boolean;
    customAvailability: {
      dayOfWeek: string;                // mon, tue, wed, thu, fri, sat, sun
      allDay: boolean;
      availability: string;             // always, never, custom
      customHours: {
        startTime: Date;
        endTime: Date;
        status: string;                 // booked, reserved, free
      }[];
    }[];
  };
  noticeInAdvance: {
    alwaysAvailableImmediately: boolean;
    hoursRequired: number;              // 1-24 hours advance notice
  };
  minTripDuration: {
    noMinimum: boolean;
    unit: string;                       // hours, days, weeks
    shortestDuration: number;
  };
  maxTripDuration: {
    noMaximum: boolean;
    unit: string;                       // days, weeks
    longestDuration: number;
  };
}
```

### Reservation & Booking Models

#### Reservation Core Data (`TReservationInfo`)
```typescript
interface TReservationInfo {
  listingId: number;                    // Links to vehicle
  pickupTime: string | Date;            // Rental start datetime
  returnTime: string | Date;            // Rental end datetime
  totalPrice: number;                   // Final total amount
  serviceFeeAmount?: number;            // Platform service fee
  durationPrice: number;                // Base rental price
  
  // Discount Applications
  discounts?: {
    advanceBookingDiscounts: TDiscountedPrice;
    longBookingDiscounts: TDiscountedPrice;
  };
  
  // Peak Pricing
  incPrice?: TPeakIncreasePrice;
  
  // Custom Pricing Overrides
  reservationCustomPrice?: ICustomPricing[];
  
  // Delivery Details
  dropOffLocation?: ReservationLocationState;
  deliveryDetails?: TDeliveryDetails;
  
  reservationDuration: string;          // Human-readable duration
}
```

#### Reservation Status Tracking
```typescript
type TReservationStatus = 
  | 'pending'           // Initial booking state
  | 'confirmed'         // Host approved
  | 'cancelled'         // Generic cancellation
  | 'completed'         // Trip finished
  | 'cancelledByGuest'  // Guest initiated cancellation
  | 'cancelledByHost'   // Host initiated cancellation
  | 'adminCompleted';   // Admin marked complete

type TPaymentStatus = 
  | 'pending'           // Awaiting payment
  | 'paid'              // Payment successful
  | 'refundable'        // Eligible for refund
  | 'refunded'          // Refund processed
  | 'refundedAsCredit'; // Refunded as platform credit
```

### Voucher & Promotion System

#### Voucher Data Model (`TVoucher`)
```typescript
interface TVoucher {
  _id: string;                          // MongoDB ObjectId
  promotionId: string;                  // Links to parent promotion
  voucherCode: string;                  // User-facing code (e.g., "SUMMER20")
  
  // Discount Configuration
  discountType: string;                 // "percentage" or "amount"
  discountAmount: number;               // Value of discount
  maxDiscountAmount: number | null;     // Cap for percentage discounts
  
  // Usage Controls
  maxUsageCount: number;                // Total usage limit
  maxUsagePerUser: number;              // Per-user usage limit
  voucherUsageCount: number;            // Current usage count
  voucherUsageAmount: number;           // Total amount discounted
  
  // Status Flags
  isActive: boolean;                    // Manually enabled/disabled
  isExpired: boolean;                   // Time-based expiry
  isPaused: boolean;                    // Temporarily suspended
  isPublic: boolean;                    // Publicly discoverable
  
  // Business Rules Engine
  voucherRules: TVoucherRule[];         // Rule-based eligibility
  
  // Timestamps
  expiresAt: string;                    // Expiry datetime
  activateAt?: string;                  // Activation datetime
  createdAt: string;
  updatedAt: string;
  
  // Usage Tracking
  voucherUsedBy: TVoucherUsage[];       // Individual usage records
}
```

#### Voucher Rules Engine (`TVoucherRule`)
```typescript
interface TVoucherRule {
  id: string;                           // Rule identifier
  field: string;                        // Target field (e.g., "carType", "reservationDuration")
  operator: string;                     // Comparison operator (eq, gt, lt, in, etc.)
  valueSource: string;                  // Value source type
  value: any;                           // Rule value(s)
}

// Example Rules:
// { field: "carType", operator: "in", value: ["SUV", "Sedan"] }
// { field: "reservationDuration", operator: ">=", value: 3 }
// { field: "guestTotalTrips", operator: "<=", value: 5 }
// { field: "monthOfTravel", operator: "eq", value: "December" }
```

#### Voucher Validation Request (`TVoucherValidateRequest`)
```typescript
interface TVoucherValidateRequest {
  totalAmount: number;                  // Pre-discount total
  additionalData: {
    carListingId: number;
    reservationDuration: number;        // In days/hours
    travelStartDate: TDate;
    travelEndDate: TDate;
    carRates?: CarDataRates;
    carType?: string;
  };
  voucherInfo?: TVoucherInfo;           // Voucher details for validation
}
```

### Promotion System (`TPromotion`)
```typescript
interface TPromotion {
  _id: string;                          // MongoDB ObjectId
  title: string;                        // Campaign name
  description: string;                  // Campaign description
  
  // Budget Management
  totalBudget: number;                  // Total campaign budget
  remainingBudget: number;              // Available budget
  
  // Rule Engine
  promotionRules: TVoucherRule[];       // Campaign-level rules
  
  // Status & Lifecycle
  expiresAt: string;                    // Campaign end date
  isExpired: boolean;                   // Time-based expiry
  
  // Associated Vouchers
  vouchers: string[];                   // Array of voucher IDs
  
  // Audit Trail
  createdBy: string;                    // Admin user ID
  updatedBy: { adminId: string; updatedAt: string }[];
  changeLogs: any[];                    // Change history
  
  createdAt: string;
  updatedAt: string;
}
```

## 3. Backend Service Flows

### Vehicle Availability Query Flow

**Function**: `verifyConfirmReservationAvailability()`
**Location**: `src/context/SearchProvider.tsx`

```typescript
// Input Parameters
pickupDateTime: string;
returnDateTime: string;
carAvailability: CarDataAvailability;
reservationList: TVehicleReservation[];

// Validation Steps:
1. validateReservations()          // Check existing bookings
2. validateBlockDates()            // Check custom blocked periods  
3. verifyMinTravelDays()          // Minimum duration validation
4. verifyMaxTravelDays()          // Maximum duration validation
5. verifyCustomPickupReturn()     // Custom availability hours
6. getIsNoticePeriodRequired()    // Advance notice validation

// Output: boolean (availability confirmed)
```

### Reservation Creation Flow

**Hook**: `useCarListing` 
**Location**: `src/hooks/useCarListing.tsx`

```typescript
// API Endpoint Pattern
PUT /listing/{action}/{listingId}

// Example Endpoints:
PUT /listing/features-description/{listingId}
PUT /listing/pickup-location/{listingId}

// Request Flow:
1. Frontend validation
2. Axios request with JWT token
3. Backend processing
4. Local state update via React Query
5. UI notification (success/error)
```

### Voucher Validation Service Flow

**Context**: Applied during checkout process

```typescript
// Validation Request Structure
{
  totalAmount: number;
  additionalData: {
    carListingId: number;
    reservationDuration: number;
    travelStartDate: Date;
    travelEndDate: Date;
    carRates: CarDataRates;
    carType: string;
  };
  voucherInfo: {
    discountType: string;
    discountAmount: number;
    maxDiscountAmount: number;
    voucherRules: TVoucherRule[];
  }
}

// Validation Steps:
1. Rule engine evaluation (field-by-field)
2. Usage limit checks (per-user, global)
3. Expiry and activation date validation
4. Budget availability check
5. Discount calculation and capping

// Response Structure
{
  isVoucherValid: boolean;
  responseMessage: string;
  discountAmount: number;
  discountType: string;
  totalAfterDiscount: number;
  voucherCode: string;
  voucherId: string;
}
```

### Payment Processing Flow

**Payment Methods Support**:
```typescript
type TPaymentMethods = 
  | 'onlyCard'              // Credit/debit card only
  | 'onlyVoucher'           // Voucher covers full amount
  | 'onlyCredit'            // Platform credit only  
  | 'onlyVoucherWithHold'   // Voucher + card hold
  | 'onlyCreditWithHold'    // Credit + card hold
  | 'cardWithCredit'        // Combination payment
  | 'cardWithVoucher'       // Card + voucher
  | 'noPayment';            // No payment required
```

## 4. Payload Scaffolding

### Vehicle Search Request
```typescript
// Search Parameters
{
  city: string;
  country: string;
  postcode: string;
  region: string;
  lat: string;
  long: string;
  pickup: string;           // ISO datetime
  return: string;           // ISO datetime
  address: string;
}

// Response: TSearchedCar[]
{
  _id: string;
  listingId: number;
  hostId: string;
  availability: CarDataAvailability;
  totalTrips: number;
  ratingsReceivedFrom: number;
  totalRatings: number;
  location: { pickupAddress: AddressState };
  car: {
    make: string;
    model: string;
    transmissionType: string;
    seats: number;
    carType: string;
    fuelType: string;
  };
  rates: {
    hourlyRates: { currency: string; amount: number };
    dailyRates: { currency: string; amount: number };
  };
  photos: { coverPhoto: TPhoto };
  isNoticeHourRequired?: boolean;
}
```

### Reservation Creation Request
```typescript
{
  listingId: number;
  pickupTime: string;       // ISO datetime
  returnTime: string;       // ISO datetime
  totalPrice: number;
  serviceFeeAmount: number;
  durationPrice: number;
  
  // Optional Components
  discounts?: {
    advanceBookingDiscounts: TDiscountedPrice;
    longBookingDiscounts: TDiscountedPrice;
  };
  incPrice?: TPeakIncreasePrice;
  reservationCustomPrice?: ICustomPricing[];
  dropOffLocation?: ReservationLocationState;
  deliveryDetails?: TDeliveryDetails;
  
  // Guest Details
  guestVerificationInfo: TGuestVerificationFlags;
  additionalDrivers?: TSaveAdditionalDriverInfo[];
  guestCoveragePackage: TGuestInsurance;
  
  // Payment Information
  paymentMethod: TPaymentMethods;
  appliedVoucherInfo?: TAppliedVoucherInfo;
  appliedCreditInfo?: TAppliedCreditInfo;
}
```

### Voucher Application Request
```typescript
{
  voucherCode: string;
  totalAmount: number;
  additionalData: {
    carListingId: number;
    reservationDuration: number;
    travelStartDate: string;    // ISO date
    travelEndDate: string;      // ISO date
    carRates?: CarDataRates;
    carType?: string;
    guestTotalTrips?: number;
    monthOfTravel?: string;
    isEmailVerified?: boolean;
  }
}
```

### Vehicle Delivery Request
```typescript
{
  deliveryVehicle: {
    pickupLocation: {
      address: string;
      postalCode: string;
      latitude: number;
      longitude: number;
    };
    distanceKm: number;
    deliveryLocation: {
      address: string;
      postalCode: string;
      latitude: number;
      longitude: number;
    };
    pricing: {
      deliveryTotalFee: number;
    };
    returnEnabled: boolean;
  };
  totalDeliveryFee?: number;
  totalReturnFee?: number;
  deliveryFeeDiscount?: number;
  returnFeeDiscount?: number;
  isDeliveryEnabled: boolean;
  isReturnEnabled: boolean;
}
```

## 5. State Management Architecture

### Primary Context Providers

**SearchProvider** (`src/context/SearchProvider.tsx`)
- Central state management for booking flow
- Vehicle search and filtering
- Reservation pricing calculations
- Voucher and credit management
- Availability validation logic

**CarListingProvider** (`src/context/CarListingProvider.tsx`)  
- Vehicle listing creation and editing
- Step-by-step listing wizard state
- Photo upload and management

**ProfileInfoProvider** (`src/context/ProfileInfoProvider.tsx`)
- User profile and verification status
- Guest verification flags
- Authentication state

### Data Flow Patterns

1. **Search → Selection → Booking**
   - User searches → `SearchProvider` manages results
   - Vehicle selection → Context stores vehicle details  
   - Booking flow → Multi-step reservation process

2. **Voucher Application**
   - User enters code → Frontend validation
   - Backend rule evaluation → Discount calculation
   - Price update → Context state refresh

3. **Availability Checking**
   - Real-time validation against existing bookings
   - Custom availability rules processing
   - Dynamic pricing based on duration and dates

## 6. Technology Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript (strict mode)
- **State Management**: React Context + useState
- **Data Fetching**: TanStack React Query (v4)
- **HTTP Client**: Axios with interceptors
- **UI Framework**: Material-UI (MUI) v5
- **Styling**: Tailwind CSS
- **Authentication**: JWT tokens with localStorage
- **Maps**: React Leaflet
- **Date Handling**: Day.js, Moment.js
- **Payment**: Stripe integration
- **File Upload**: Cloudinary integration
- **Package Manager**: pnpm

## 7. API Integration Patterns

### Authentication Flow
```typescript
// Token Storage: localStorage['tashus']
{
  accessToken: string;
  userId: string;
  emailVerified: boolean;
  // ... other user data
}

// Automatic injection via Axios interceptors
config.headers['Authorization'] = `Bearer ${accessToken}`;
```

### Error Handling
- 401 responses trigger automatic logout and redirect
- Token refresh mechanism (commented code suggests future implementation)
- User-friendly error messages via snackbar notifications

### API Endpoint Patterns
```
GET    /listing/listed-car/{listingId}          # Get vehicle details
PUT    /listing/features-description/{listingId} # Update vehicle features  
PUT    /listing/pickup-location/{listingId}     # Update pickup location
POST   /voucher/validate                        # Validate voucher code
POST   /reservation/create                      # Create new booking
GET    /user/profile                           # Get user profile
```

This blueprint captures the core architectural intelligence of the Tashus Frontend application, focusing on the dynamic, data-driven structures that power vehicle rental operations, real-time availability management, booking reservations, and voucher/promotion systems.