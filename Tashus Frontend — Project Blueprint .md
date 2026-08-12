# Tashus Frontend — Project Blueprint

> **Purpose:** Single-source architectural context anchor for AI agents and engineers.
> Covers vehicles, live availability, reservations, vouchers, and promotions.
> Derived from static analysis of `Tashus_Frontend_V1` source code.

---

## Table of Contents

1. [Tech Stack](#1-tech-stack)
2. [Directory Structure Map](#2-directory-structure-map)
3. [Data Models](#3-data-models)
   - 3.1 Vehicle (CarDataState)
   - 3.2 Availability Matrix
   - 3.3 Rates & Pricing
   - 3.4 Reservation
   - 3.5 Voucher
   - 3.6 Promotion
   - 3.7 Delivery Request
4. [API Endpoint Catalogue](#4-api-endpoint-catalogue)
5. [Backend Service Flows](#5-backend-service-flows)
   - 5.1 Vehicle Search & Availability Query
   - 5.2 Reservation Creation
   - 5.3 Reservation Cancellation
   - 5.4 Voucher Validation
6. [Payload Scaffolding](#6-payload-scaffolding)
   - 6.1 Create Reservation Request
   - 6.2 Voucher Validate Request
   - 6.3 Voucher Validate Response
   - 6.4 Block-Dates Response
   - 6.5 Payment Intent Request
   - 6.6 User Voucher Fetch Request
7. [State Management — Key Contexts](#7-state-management--key-contexts)
8. [Frontend Availability Validation Logic](#8-frontend-availability-validation-logic)
9. [Price Calculation Pipeline](#9-price-calculation-pipeline)
10. [Auth & Security Layer](#10-auth--security-layer)

---

## 1. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14.2.4 (App Router) |
| Language | TypeScript 5.1.3 |
| UI | MUI v5, Tailwind CSS 3.3.2 |
| State | React Context API + TanStack React Query v4 |
| Forms | React Hook Form v7 + Zod v3 |
| HTTP Client | Axios v1.4 (authenticated via `axiosClient` interceptor) |
| Auth | NextAuth v4 (JWT stored in `localStorage.tashus.accessToken` + HTTP-only cookies) |
| Payment | Stripe Elements + Stripe JS v3 |
| Maps | Leaflet / React-Leaflet |
| Date/Time | Day.js (with `isBetween`, `duration`, UTC plugins) |
| Calendar | react-big-calendar, react-calendar-timeline, react-date-range |
| Deployment | Vercel |
| Error Monitoring | Sentry v8 |
| Image Storage | Cloudinary (public_id + secure_url pattern throughout) |

---

## 2. Directory Structure Map

```
src/
├── app/                         # Next.js App Router pages
│   ├── api/auth/                # NextAuth route handlers
│   ├── car-listing/[carListingId]/  # Host vehicle listing wizard
│   ├── search/                  # Guest search results
│   │   └── [vehicleId]/
│   │       ├── vehicle-details/ # Public vehicle detail page
│   │       ├── checkout/        # Reservation checkout
│   │       └── payment/[reservationId]/  # Stripe payment page
│   ├── promotion/[voucherSlug]/ # Public voucher/promo landing page
│   ├── dashboard/[userId]/      # Authenticated user dashboard
│   │   └── travels/details/[reservationId]/ # Reservation detail page
│   └── payment/holdAmount/[reservationId]/  # Hold deposit payment
│
├── components/
│   ├── CarListing/              # Vehicle listing wizard steps (7 steps)
│   ├── Search/ReservationCheckout/  # Checkout form + voucher/credit UI
│   ├── Payment/                 # Stripe Elements integration
│   └── UserProfileUpdated/Travels/  # Reservation management for guests/hosts
│
├── context/
│   ├── SearchProvider.tsx       # Central state: search, availability, pricing, checkout
│   ├── CarListingProvider.tsx   # Host listing wizard state
│   ├── TravelProvider.tsx       # Active reservation state
│   └── PaymentDetailsProvider.tsx
│
├── hooks/
│   ├── car-listing/             # Listing wizard mutations (CRUD for each section)
│   ├── car-search/              # Vehicle search & block-date queries
│   ├── reservation/             # Reservation CRUD + voucher hooks
│   │   └── voucher/             # useCheckVoucherValidation
│   ├── payment/
│   │   └── reservation-payment/ # Stripe intent creation
│   └── promotion-page/          # Voucher & promotion page queries
│
├── types/
│   ├── car-listing/             # All vehicle data model types
│   ├── car-search/              # Search result types, block-date types
│   ├── travels/                 # Reservation, trip, payment enums & types
│   ├── checkout/                # Checkout, voucher, credit types
│   ├── voucher-promotion/       # TVoucher, TPromotion, TVoucherRule
│   ├── payment/                 # Payment intent, additional fee types
│   ├── reservations/            # Delivery, invoice types
│   └── vehicle-delivery/        # Delivery request & pricing types
│
└── utils/
    ├── Functions/
    │   ├── reservationValidationFn.tsx  # All availability & price logic
    │   ├── utcCommonFn.tsx              # UTC date helpers
    │   └── searchCommonFn.tsx           # Notice period helpers
    └── configs/axiosInstance.ts         # Authenticated Axios singleton
```

---

## 3. Data Models

### 3.1 Vehicle (`CarDataState`)
File: `src/types/car-listing/carListingTypes.ts`

```typescript
type CarDataState = {
  _id: string;                         // MongoDB ObjectId
  hostId: string;                      // Owner's userId
  listingId: number;                   // Auto-incrementing numeric ID (used in URLs/APIs)
  listingStatus: CarListingStatusValues;
  carNickName: string;
  car: {                               // Core vehicle identity
    licensePlate: { number: string; state: string };
    vin: string;
    make: string;
    model: string;
    year: number;
    color: string;
    carType: string;                   // e.g. 'SUV', 'Sedan', 'Hatchback'
    seats: number;
    doors: number;
    windows: number;
    fuelType: string;                  // 'Petrol' | 'Diesel' | 'Electric' | 'Hybrid'
    fuelInfo?: { fuelType: string; unitPrice: number; unitName: string };
    transmissionType: string;          // 'Manual' | 'Automatic'
    mileage: { distance: number; units: string };
    trim: string;
    expiry: string;                    // Registration expiry date
  };
  features: string[];                  // Standard feature tags
  additionalFeatures: string[];        // Custom host-added features
  additionalInfos: { carDescription: string; guidelines: string };
  vehicleObligations: { neverWrittenOff: boolean; ctpInsurance: boolean };
  location: CarLocationState;
  availability: CarDataAvailability;
  rates: CarDataRates;
  guidelines: CarDataGuidelines;
  photos: CarDataPhotos;
  distance: CarDataDistance;
  ownerAgreement: { agreementId: string; contentId: string };
  carServiceStatus: string;
  totalTrips: number;
  ratingsReceivedFrom: number;
  totalRatings: number;
  insurancePolicies: CarDataInsuranceInfo[];
  carServiceLog?: CarDataServiceLog;
  keyHandovers?: TKeyHandover[];
  createdAt: string;
  updatedAt: string;
};

type CarListingStatusValues =
  | 'draft' | 'pending' | 'listed' | 'unlisted'
  | 'update' | 'unlistedByTashus' | 'demo'
  | 'listedByOwner' | 'user-deleted' | 'user-deactivated';
```

**Location sub-model:**
```typescript
type CarLocationState = {
  pickupAddress: {
    city: string; state: string; stateShortCode: string;
    country: string; countryShortCode: string;
    street: string; postalCode?: string;
    coordinates: [number, number];  // [lng, lat]
  };
  parkingInstructions: string;
  pickupHistory?: PickupHistoryState[];
};
```

**Photo sub-model:**
```typescript
type CarDataPhotos = {
  coverPhoto: TPhoto;
  initialConditionPhotos: TPhoto[];
  additionalPhotos: TPhoto[];
  vehicleInspectionPhotos: TPhoto[];
  updatedAt: string;
};
// TPhoto = { imageInfo: { public_id, secure_url, format, ... }, storageProvider?: string }
```

---

### 3.2 Availability Matrix (`CarDataAvailability`)
File: `src/types/car-listing/carAvailabilityTypes.ts`

```typescript
type CarDataAvailability = {
  pickupReturnHour: {
    alwaysAvailable: boolean;
    customAvailability?: {
      dayOfWeek: string;            // 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
      availability: string;         // 'always' | 'never' | 'custom'
      allDay: boolean;
      checked: boolean;
      customHours: {
        startTime: Date;
        endTime: Date;
        status: string;             // 'booked' | 'reserved' | 'free'
      }[];
    }[];
  };
  noticeInAdvance: {
    alwaysAvailableImmediately: boolean;
    hoursRequired?: number;         // 1–24 hrs advance notice
  };
  minTripDuration: {
    noMinimum: boolean;
    unit: string;                   // 'hours' | 'days' | 'weeks'
    shortestDuration: number;       // e.g. 3h, 6h, 9h, 12h, 1d, 2d, 3d, 5d, 1w
  };
  maxTripDuration: {
    noMaximum: boolean;
    unit: string;                   // 'days' | 'weeks'
    longestDuration: number;        // e.g. 3d, 5d, 1w, 10d, 2w, 3w, 4w, 5w, 6w
  };
};
```

**Block dates** (stored separately, fetched per vehicle):
```typescript
type TCarBlockDate = {
  _id: string;
  start: Date;          // UTC ISO string
  end: Date;            // UTC ISO string
  title: string;
  createdAt: Date;
};
// Response is split into:
//   allDayList  — start is 00:00:00 UTC, end is 23:59:59 UTC
//   customList  — specific hour ranges
```

---

### 3.3 Rates & Pricing (`CarDataRates`)
File: `src/types/car-listing/carListingTypes.ts`, `carPricingTypes.ts`

```typescript
type CarDataRates = {
  hourlyRates: { currency: string; amount: number };
  dailyRates:  { currency: string; amount: number };

  // Peak surcharge (e.g. weekends)
  peakIncrease: {
    dayOfWeek: string;            // 'mon'–'sun'
    increaseType: string;         // 'amount' | 'percentage'
    amount?: number;
    percentage?: number;
  }[];

  // Long-stay discounts (e.g. 7+ days = 10% off)
  longBookingDiscounts: {
    value: string | number;       // threshold duration
    unit: 'days' | 'weeks' | '';
    percentage: string | number;  // discount %
  }[];

  // Advance-booking discounts (e.g. book 7+ days ahead)
  advanceBookingDiscounts: {
    value: string | number;
    unit: 'days' | 'weeks' | '';
    percentage: string | number;
  }[];

  longBookingDiscountActive?: boolean;
  advanceBookingDiscountActive?: boolean;

  // Date-specific custom pricing overrides
  customPricing: {
    date: TDate;                  // ISO date string for a single day
    hourlyRates: number;
    dailyRates: number;
    updatedHourlyRates: number;   // computed final value after adjustment
    updatedDailyRates: number;
    rateType?: string;            // 'F' (Fixed) | 'P' (Percentage)
    rateChange?: string;          // 'I' (Increase) | 'D' (Decrease)
  }[];

  updatedAt?: string;
};
```

**Distance & fuel charging:**
```typescript
type CarDataDistance = {
  unlimitedTravel: boolean;
  maximumDailyDistance: number;          // km per day
  additionalFeePerKilometer: number;     // AUD per km over limit
  fuelGauges: CarDataFuelGauge[];
  fuelEconomy?: { maxFuel: number; fuelCost: number };
};
```

---

### 3.4 Reservation (`TReservation` / `TravelDetailsState`)
Files: `src/types/travels/typeTravels.ts`, `travelEnums.ts`

```typescript
type TReservation = {
  reservationId: number;          // Auto-incrementing numeric ID
  guestId: string;                // Guest's userId
  hostId: string;                 // Host's userId
  carListingId: number;           // Links to CarDataState.listingId
  startDate: Date;                // UTC ISO
  endDate: Date;                  // UTC ISO
  totalDurationHours: number;
  totalDistanceKm?: number;
  dailyDistanceKm?: number;
  additionalDistanceFeePerKm?: number;

  basePrice: {
    dailyPrice: number;
    hourlyPrice: number;
    totalPrice: number;
    durationPrice: number;
    currency: string;
    serviceFeeAmount: number;
    customPrices?: CustomPricing[];
    coverageAmount?: number;
    gstAmount?: number;
    hostIncome?: number;
    totalDeliveryFee?: number;
    totalReturnFee?: number;
    deliveryFeeDiscount?: number;
    returnFeeDiscount?: number;
    payableAmount?: number;
    refundableAmount?: number;
  };

  serviceFeePercentage: number;   // e.g. 10 (= 10%)
  depositAmount: number;          // Hold/security deposit (AUD)

  reservationStatus: TReservationStatus;
  // 'pending' | 'confirmed' | 'cancelled' | 'completed'
  // | 'cancelledByGuest' | 'cancelledByHost' | 'adminCompleted'

  paymentStatus?: ReservationPaymentStatusEnum;
  // 'pending' | 'pendingCharge' | 'paid' | 'refundable'
  // | 'refunded' | 'refundedAsCredit' | 'partiallyPaid' | 'not_required'

  paymentMethod?: TPaymentMethods;
  // 'onlyCard' | 'onlyVoucher' | 'onlyCredit'
  // | 'cardWithCredit' | 'cardWithVoucher'
  // | 'onlyCreditWithHold' | 'onlyVoucherWithHold' | 'noPayment'

  pickupLocation: ReservationLocationState;
  dropOffLocation: ReservationLocationState;

  discounts?: {
    advanceBookingDiscounts?: TDiscountedPrice;
    longBookingDiscounts?: TDiscountedPrice;
  };

  peakIncrease?: {
    calculatedAmount?: number;
    increaseType?: 'percentage' | 'amount';
    increaseAmount?: number;
    increaseDays?: string[];
  };

  insurance?: { guestCoverageType: string; coveragePercentage: number; excessFee: number };

  additionalPaymentInfo?: {
    cardAmountUsed?: number;
    creditAmountUsed?: number;
    voucherCode?: string;
    voucherAmountUsed?: number;
    voucherId?: string;
    voucherUsedId?: string;
    chargeId?: string;
  };

  tripInformation?: TTripInformation;
  revisedReservations?: TRevisedReservation[];
  revisedVehicles?: TRevisedVehicle[];
  revisedCoverages?: TRevisedCoverage[];
  voucherInfo?: TVoucherInfo;
  notes?: TReservationNote[];
};
```

**Reservation Status Enum:**
```typescript
enum EReservationStatus {
  Pending        = 'pending',
  Confirmed      = 'confirmed',
  Completed      = 'completed',
  AdminCancelled = 'adminCancelled',
  AutoCompleted  = 'autoCompleted',
  AdminCompleted = 'adminCompleted',
  Disputed       = 'disputed',
  ForcedCompletion = 'forcedCompletion',
  Cancelled      = 'cancelled',
  CancelledByHost  = 'cancelledByHost',
  CancelledByGuest = 'cancelledByGuest',
}
```

---

### 3.5 Voucher (`TVoucher`)
File: `src/types/voucher-promotion/promotionTypes.ts`

```typescript
type TVoucher = {
  _id: string;
  promotionId: string;              // Parent TPromotion._id
  voucherCode: string;              // Unique alphanumeric code
  voucherSlug: string;              // URL-friendly slug for public landing page
  voucherTitle: string;
  description: string;

  // Discount configuration
  discountType: string;             // 'fixed' | 'percentage'
  discountAmount: number;           // Value (AUD or %)
  maxDiscountAmount: number | null; // Cap for percentage discounts

  // Usage limits
  maxUsageCount: number;            // Total redemptions allowed across all users
  maxUsagePerUser: number;          // Per-user limit
  voucherUsageCount: number;        // Current total redemption count
  voucherUsageAmount: number;       // Total AUD discount given out

  // Lifecycle
  isActive: boolean;
  isPaused: boolean;
  isPublic: boolean;
  isExpired: boolean;
  activateAt?: string;              // ISO date — delayed activation
  expiresAt: string;                // ISO date — hard expiry

  // Eligibility rules (json-logic-like rules engine)
  voucherRules: TVoucherRule[];

  // Media & metadata
  voucherImages: { public_id: string; secure_url: string }[];
  voucherTerms?: any;
  applicableUserDescription?: string;

  // Usage audit
  voucherUsedBy: {
    userId: string;
    amount: number;                 // AUD discount given to this user
    reservationId: number;
    _id: string;
  }[];

  createdBy: string;
  creator: { adminUserName: string; adminId: string };
  changeLogs: ChangeLog[];
  createdAt: string;
  updatedAt: string;
};
```

**Voucher Rule (eligibility engine):**
```typescript
type TVoucherRule = {
  id: string;
  field: string;        // e.g. 'carType', 'reservationDuration', 'guestTotalTrips',
                        //      'monthOfTravel', 'isEmailVerified', 'carListingId'
  operator: string;     // e.g. '=', '>', '>=', 'in', 'contains'
  valueSource: string;  // 'value' (static) | 'field' (dynamic)
  value: any;           // The comparison target
};
```

---

### 3.6 Promotion (`TPromotion`)
File: `src/types/voucher-promotion/promotionTypes.ts`

```typescript
type TPromotion = {
  _id: string;
  title: string;
  description: string;
  totalBudget: number;              // AUD — total campaign budget
  remainingBudget: number;          // AUD — budget remaining
  promotionRules: TVoucherRule[];   // Top-level rules inherited by child vouchers
  expiresAt: string;                // ISO date
  isExpired: boolean;
  createdBy: string;                // Admin userId
  vouchers: string[];               // Array of TVoucher._id references
  updatedBy: { adminId: string; updatedAt: string; _id: string }[];
  changeLogs: any[];
  createdAt: string;
  updatedAt: string;
};
```

---

### 3.7 Delivery Request (`TDeliveryRequestInfo`)
File: `src/types/reservations/reservationDeliveryTypes.ts`

```typescript
type TDeliveryRequestInfo = {
  requestType: 'delivery' | 'return';
  carListingId: number;
  reservationId: number;
  platform: 'tashus' | 'driver_app';
  pickupLocation: { address: string; latitude: number; longitude: number };
  deliveryLocation: { address: string; latitude: number; longitude: number };
  distanceKm: number;
  requestStatus: EDeliveryRequestStatus;
  // 'pending' | 'assigned' | 'accepted' | 'inprogress' | 'completed' | 'cancelled'
  paymentStatus: EDeliveryPaymentStatus;
  // 'pending' | 'paid' | 'refunded' | 'failed' | 'cancelled' | 'partially_paid' | 'under_review'
  deliveryTime: TDate;
  pricing: {
    discount: number; cancellationFee: number; tips: number;
    deliveryTotalFee: number; currency: string;
  };
  deliveryTracker: { stage: EDeliveryStage; timestamp: TDate; description: string }[];
  assignedDriver?: TAssignedDriver;
  cancellationDetails?: TCancellationDetails;
};
```

---

## 4. API Endpoint Catalogue

All endpoints are prefixed with `NEXT_PUBLIC_API_URL`. Authenticated calls attach `Authorization: Bearer <accessToken>` via the `axiosClient` interceptor.

### Vehicle / Listing

| Method | Endpoint | Auth | Hook / File | Description |
|--------|----------|------|-------------|-------------|
| POST | `/listing/car-details` | ✅ | `useAddCarDetails` | Create/update vehicle info (Step 1) |
| PUT | `/listing/availability/{listingId}` | ✅ | `useSaveCarAvailability` | Save availability matrix (Step 3) |
| PUT | `/listing/rates/{listingId}` | ✅ | `useSaveCarRates` | Save pricing rates (Step 4) |
| GET | `/search/find-cars` | ❌ | `useSearchedCars` | Search vehicles by location + dates |
| GET | `/search/find-cars/{listingId}` | ❌ | `usePublicVehicleDetails` | Fetch single public vehicle detail |
| PUT | `/search/vehicle-delivery-price/{drivingDistanceInKm}` | ❌ | `useGetVehicleDeliveryPrice` | Calculate delivery fee by km |

### Availability & Block Dates

| Method | Endpoint | Auth | Hook / File | Description |
|--------|----------|------|-------------|-------------|
| GET | `/reservation/block-dates-by-car/{carListingId}` | ❌ | `useGetBlockDatesByCarId` | Fetch all blocked date windows for a vehicle |

### Reservations

| Method | Endpoint | Auth | Hook / File | Description |
|--------|----------|------|-------------|-------------|
| POST | `/reservation/create` | ✅ | `useCreateReservation` | Create a new reservation |
| GET | `/reservation/find-details/{reservationId}` | ✅ | `useReservationDetails` | Fetch single reservation detail |
| PUT | `/reservation/travel-cancel-by-host/{reservationId}` | ✅ | `useCancelUpcomingReservation` | Host cancels upcoming reservation |

### Payment (Stripe)

| Method | Endpoint | Auth | Hook / File | Description |
|--------|----------|------|-------------|-------------|
| POST | `/payment/stripe-element` | ✅ (header) | `createReservationPaymentIntent` | Immediate card charge intent |
| POST | `/payment/stripe-hold-with-payment` | ✅ (header) | `createReservationPaymentIntent` | Card charge + deposit hold |
| POST | `/payment/stripe-hold-only` | ✅ (header) | `createHoldIntent` | Hold deposit only (no charge) |

### Vouchers

| Method | Endpoint | Auth | Hook / File | Description |
|--------|----------|------|-------------|-------------|
| POST | `/voucher/check-voucher-validity` | ✅ | `useVoucherValidity` (legacy) | Validate voucher code (old flow) |
| PUT | `/v2/voucher/validate-voucher` | ✅ | `useCheckVoucherValidation` | Validate voucher code (current) |
| GET | `/voucher/get-common-vouchers` | ❌ | `useGetCommonVouchers` | Fetch publicly available vouchers |
| POST | `/voucher/get-vouchers/{userId}` | ✅ | `useGetLoginUserVouchers` | Fetch vouchers eligible for logged-in user |
| GET | `/v2/voucher/slug/{voucherSlug}` | ❌ | `useGetSingleVoucherDetails` | Fetch single voucher by URL slug |

---

## 5. Backend Service Flows

### 5.1 Vehicle Search & Availability Query

**Trigger:** User enters location + pickup/return datetime on `/search` page.

```
1. useSearchedCars()
   └─ GET /search/find-cars
      params: { city, country, postcode, region, lat, long, from, to, currentDateTime }
      └─ Backend: geo-query CarListing collection by coordinates + listingStatus='listed'
         Filters vehicles whose availability.pickupReturnHour allows the requested times.
         Returns: TSearchedCar[] (partial projection — rates, location, car info, cover photo only)

2. On vehicle selection → usePublicVehicleDetails()
   └─ GET /search/find-cars/{listingId}
      └─ Returns: Full CarDataState (public fields) + hostInfo object

3. useGetBlockDatesByCarId()
   └─ GET /reservation/block-dates-by-car/{carListingId}
      └─ Returns: TCarBlockDate[] — host-defined blocked windows

4. Frontend splits block dates:
   - allDayList  ← isStartOfDayUtc() && isEndOfDayUtc()
   - customList  ← all others

5. verifyConfirmReservationAvailability() [SearchProvider.tsx]
   Runs entirely in-browser on carAvailability + singleCarBlockDates + singleCarReservationList:
   Step A: validateReservations() — checks overlap with confirmed/pending reservations (±29 min buffer)
   Step B: validateBlockDates()  — checks overlap with custom block-date windows
   Step C: noticeInAdvance check — if !alwaysAvailableImmediately, hoursRequired vs advanceTimeDiff
   Step D: verifyMinTravelDays() — unit-aware min duration check
   Step E: verifyMaxTravelDays() — unit-aware max duration check
   Step F: verifyCustomPickupReturn() — per-day, per-slot pickup/return time validation
   Returns: boolean (true = available, false = blocked with error message in state)
```

---

### 5.2 Reservation Creation

**Trigger:** Guest clicks "Confirm Reservation" on the checkout page.

```
1. [Checkout] Assemble SaveNewReservationParams:
   - guestId, hostId, carListingId, startDate, endDate
   - basePrice (durationPrice + serviceFeeAmount + peakIncrease + discounts + delivery)
   - depositAmount (hold amount)
   - insurance (guestCoverageType, coveragePercentage, excessFee)
   - paymentMethod (determines post-creation route)
   - additionalPaymentInfo (cardAmountUsed, creditAmountUsed, voucherCode, voucherAmountUsed, voucherId)
   - discounts.advanceBookingDiscounts + discounts.longBookingDiscounts
   - peakIncrease (days, type, amount)
   - additionalDrivers[]
   - isDeliveryEnabled, isReturnEnabled, deliveryVehicle (if delivery flow)

2. POST /reservation/create  { ...params, origin: 'web' }
   └─ Backend: saves Reservation document, links to CarListing & User
      Sets reservationStatus='pending', paymentStatus='pending'
      Returns: { data: { reservationId: number } }

3. Frontend routing based on paymentMethod:
   ├─ 'onlyVoucher' | 'onlyCredit'
   │   └─ → /dashboard/{guestId}/travels/details/{reservationId}
   ├─ 'onlyCreditWithHold' | 'onlyVoucherWithHold'
   │   ├─ holdDepositCredit > 0 → /dashboard/{guestId}/travels/details/{reservationId}
   │   └─ else              → /payment/holdAmount/{reservationId}?from=checkout
   └─ all others (card-based)
       └─ → /search/{vehicleId}/payment/{reservationId}?from=checkout

4. [Payment Page] Stripe flow:
   ├─ Immediate charge: POST /payment/stripe-element
   │   body: { paymentData: IPayment, price, holdPrice, email }
   │   └─ Returns: { clientSecret, paymentIntentId, status }
   ├─ Hold + charge: POST /payment/stripe-hold-with-payment
   └─ Hold only:    POST /payment/stripe-hold-only
```

---

### 5.3 Reservation Cancellation

**Trigger:** Host cancels an upcoming reservation.

```
1. Host clicks "Cancel" in dashboard travel detail view.
2. useCancelUpcomingReservation()
   └─ PUT /reservation/travel-cancel-by-host/{reservationId}
      body: TCancelUpcomingReservationByHost (cancellationReason, etc.)
      └─ Backend: sets reservationStatus='cancelledByHost'
         Handles refund logic based on cancellationInfo.isRefundable
         Updates paymentStatus → 'refundable' | 'refunded' | 'refundedAsCredit'
3. Frontend: updates local travelDetails.reservationStatus → 'cancelledByHost'
```

---

### 5.4 Voucher Validation

**Trigger:** Guest enters a voucher code at checkout.

```
Current flow (v2):
1. useCheckVoucherValidation()
   └─ PUT /v2/voucher/validate-voucher
      body: {
        userId, voucherCode, totalAmount,
        additionalData: {
          carListingId, reservationDuration,
          travelStartDate, travelEndDate, guestEmail
        }
      }
      └─ Backend checks:
         a. Voucher exists and voucherCode matches
         b. isActive=true, isPaused=false, isExpired=false
         c. activateAt <= now <= expiresAt
         d. voucherUsageCount < maxUsageCount
         e. User's usage count < maxUsagePerUser
         f. ALL voucherRules pass (rules engine against additionalData)
            e.g. carListingId in [allowed_ids], reservationDuration >= X,
                 travelStartDate.month == 'december', user.emailVerified == true
         Returns: {
           success: boolean, message: string,
           responseObject: {
             isVoucherValid, discountAmount, discountType,
             totalAfterDiscount, voucherCode, voucherId
           }
         }

2. Frontend: setAppliedVoucherInfo({ isVoucherValid, discountAmount, discountType,
                                      totalAfterDiscount, voucherCode, voucherId })

3. Applied discount is included in additionalPaymentInfo.voucherCode/voucherAmountUsed
   when creating the reservation (Step 2 of 5.2).

Legacy flow (v1 — still referenced in useVoucherValidity):
   POST /voucher/check-voucher-validity
   body: { userId, voucherCode, totalAmount, additionalData: {
     carType, reservationDuration, completedReservations, monthOfTravel } }
```

---

## 6. Payload Scaffolding

### 6.1 Create Reservation Request
`POST /reservation/create`

```json
{
  "guestId": "64f3a1b2c8d9e00012345678",
  "hostId": "64f3a1b2c8d9e000abcdef01",
  "carListingId": 142,
  "startDate": "2026-08-15T03:00:00.000Z",
  "endDate": "2026-08-18T03:00:00.000Z",
  "totalDurationHours": 72,
  "totalDistanceKm": 300,
  "dailyDistanceKm": 100,
  "additionalDistanceFeePerKm": 0.35,
  "depositAmount": 500,
  "serviceFeePercentage": 10,
  "basePrice": {
    "dailyPrice": 85,
    "hourlyPrice": 12,
    "durationPrice": 255,
    "totalPrice": 280.50,
    "currency": "AUD",
    "serviceFeeAmount": 28.05,
    "coverageAmount": 0,
    "gstAmount": 0
  },
  "insurance": {
    "guestCoverageType": "standard",
    "coveragePercentage": 70,
    "excessFee": 1500
  },
  "pickupLocation": {
    "coordinates": [151.2093, -33.8688],
    "shortAddress": "Sydney NSW",
    "streetAddress": "123 George St, Sydney NSW 2000"
  },
  "dropOffLocation": {
    "coordinates": [151.2093, -33.8688],
    "shortAddress": "Sydney NSW",
    "streetAddress": "123 George St, Sydney NSW 2000"
  },
  "paymentMethod": "cardWithVoucher",
  "additionalPaymentInfo": {
    "cardAmountUsed": 240.50,
    "voucherCode": "SUMMER25",
    "voucherAmountUsed": 40.00,
    "voucherId": "64abc1234ef567890abcdef",
    "creditAmountUsed": 0
  },
  "discounts": {
    "longBookingDiscounts": {
      "calculatedAmount": 25.50,
      "text": "10% off for 3+ days",
      "duration": 3,
      "durationUnit": "days",
      "percentage": 10
    },
    "advanceBookingDiscounts": {}
  },
  "peakIncrease": {
    "increaseDays": ["sat", "sun"],
    "increaseType": "percentage",
    "increaseAmount": 15,
    "calculatedAmount": 25.50
  },
  "additionalDrivers": [],
  "isDeliveryEnabled": false,
  "isReturnEnabled": false,
  "origin": "web"
}
```

---

### 6.2 Voucher Validate Request (v2)
`PUT /v2/voucher/validate-voucher`

```json
{
  "userId": "64f3a1b2c8d9e00012345678",
  "voucherCode": "SUMMER25",
  "totalAmount": 280.50,
  "additionalData": {
    "carListingId": 142,
    "reservationDuration": 72,
    "travelStartDate": "2026-08-15T03:00:00.000Z",
    "travelEndDate": "2026-08-18T03:00:00.000Z",
    "guestEmail": "guest@example.com"
  }
}
```

### 6.3 Voucher Validate Response (v2)

```json
{
  "success": true,
  "message": "Voucher applied successfully",
  "responseObject": {
    "isVoucherValid": true,
    "discountAmount": 40.00,
    "discountType": "percentage",
    "totalAfterDiscount": 240.50,
    "voucherCode": "SUMMER25",
    "voucherId": "64abc1234ef567890abcdef"
  }
}
```

---

### 6.4 Block-Dates Response
`GET /reservation/block-dates-by-car/{carListingId}`

```json
[
  {
    "_id": "64b1234567890abcdef12301",
    "title": "Blocked",
    "start": "2026-08-10T00:00:00.000Z",
    "end": "2026-08-10T23:59:59.000Z",
    "createdAt": "2026-07-01T05:00:00.000Z"
  },
  {
    "_id": "64b1234567890abcdef12302",
    "title": "Custom Block",
    "start": "2026-08-20T08:00:00.000Z",
    "end": "2026-08-20T18:00:00.000Z",
    "createdAt": "2026-07-10T05:00:00.000Z"
  }
]
```

*First entry → `allDayList` (00:00 to 23:59 UTC). Second entry → `customList` (specific hours).*

---

### 6.5 Payment Intent Request
`POST /payment/stripe-element`

```json
{
  "paymentData": {
    "reservationId": 10042,
    "guestId": "64f3a1b2c8d9e00012345678",
    "amount": 24050,
    "payment_method": "pm_card_visa",
    "currency": "aud",
    "carListingId": 142,
    "excessFee": 1500
  },
  "price": 240.50,
  "holdPrice": 500,
  "email": "guest@example.com"
}
```

*Response:*
```json
{
  "success": true,
  "responseObject": {
    "clientSecret": "pi_3Pq...secret_abc123",
    "paymentIntentId": "pi_3Pq1234567890",
    "status": "requires_action"
  }
}
```

---

### 6.6 User Voucher Fetch Request
`POST /voucher/get-vouchers/{userId}`

```json
{
  "completedTravels": 5,
  "emailVerified": true,
  "firstTravel": false
}
```

*Server evaluates these fields against each TVoucher's voucherRules and returns eligible vouchers.*

---

## 7. State Management — Key Contexts

### SearchProvider (`src/context/SearchProvider.tsx`)
Central hub for all search-to-checkout state. Persists across the entire booking funnel.

| State Key | Type | Purpose |
|---|---|---|
| `searchParams` | `SearchParamsType` | Location + pickup/return datetime inputs |
| `searchedCarList` | `TSearchedCar[]` | Raw API results from `/search/find-cars` |
| `filteredCarList` | `TSearchedCar[]` | After applying user filters |
| `singleCarBlockDates` | `TSingleCarBlockDate` | allDayList + customList from block-dates API |
| `singleCarReservationList` | `TVehicleReservation[]` | Confirmed/pending reservations for selected vehicle |
| `totalPrice` | `number` | Final computed price shown to guest |
| `durationPrice` | `number` | Base price before discounts/fees |
| `peakIncPrice` | `TPeakIncreasePrice` | Peak surcharge breakdown |
| `discountedPrice` | `DiscountedPriceType` | long + advance discount breakdown |
| `serviceFee` | `number` | Platform fee (10% of totalPrice) |
| `reservationPriceList` | `ReservationPriceListType[]` | Per-day price breakdown list |
| `guestCoveragePackage` | `TGuestInsurance` | Selected insurance tier |
| `additionalPaymentInfo` | `any` | Voucher + credit amounts to pass on create |
| `appliedVoucherInfo` | `TAppliedVoucherInfo \| null` | Result of voucher validation |
| `appliedCreditInfo` | `TAppliedCreditInfo \| null` | Result of credit application |
| `paymentMethod` | `TPaymentMethods` | Selected payment combination |
| `vehicleDeliveryInfo` | `VehicleDeliveryInfoState` | Delivery location + fee |
| `guestVerificationFlags` | `TGuestVerificationFlags` | Verification status for checkout gate |
| `reservationCustomPriceList` | `ICustomPricing[]` | Custom per-day pricing overrides |

**Key method: `verifyConfirmReservationAvailability()`**
Pure async function on the context — runs all 6 availability checks client-side before allowing checkout progression.

---

### CarListingProvider (`src/context/CarListingProvider.tsx`)
Manages the host vehicle listing wizard (7 steps).

| State Key | Purpose |
|---|---|
| `listingId` | Current numeric listing ID (set after Step 1 creates the record) |
| `carData` | Full `CarDataState` object, updated optimistically after each save |
| `listingSteps` | Step completion tracking array |
| `licenseVerifiedData` | License plate lookup result from NEVDIS/equivalent |

---

## 8. Frontend Availability Validation Logic

File: `src/utils/Functions/reservationValidationFn.tsx`
Called from: `SearchProvider.verifyConfirmReservationAvailability()`

### Validation Sequence (in order)

```
1. EXISTING RESERVATION CONFLICT CHECK
   validateReservations(filteredCancelledReservations, pickupDateTime, returnDateTime)
   - Filters out: cancelledByGuest | cancelledByHost | cancelled
   - Gets effective dates: uses lastRevision.newStartDate/newEndDate if revised and paid
   - Buffer: ±29 minutes around each reservation
   - Overlap: any of 4 overlap conditions (pickup-in, return-in, res-start-in, res-end-in)
   - Error: "Reserved on selected time"

2. CUSTOM BLOCK DATE CONFLICT CHECK
   validateBlockDates(singleCarBlockDates.customList, pickupDateTime, returnDateTime)
   - Skips past block dates
   - Same 4-way overlap logic with isBetween (inclusive)
   - Error: "Unavailable on {date}, from {time} to {time}"

3. NOTICE IN ADVANCE CHECK
   getIsNoticePeriodRequired(hoursRequired, advanceTimeDiffInMin)
   - advanceTimeDiffInMin = diff between now and pickupDateTime in minutes
   - Error: "{X} hour(s) notice period is required"

4. MINIMUM TRIP DURATION CHECK
   verifyMinTravelDays(unit, shortestDuration, timeDiffHours, timeDiffDays, timeDiffMins)
   - 'hours': timeDiffHours >= shortestDuration
   - 'days':  timeDiffDays  >= shortestDuration
   - 'weeks': timeDiffMins  >= weeks_to_minutes(shortestDuration)
   - Error: "Reservation needs to be for minimum {X} {unit}"

5. MAXIMUM TRIP DURATION CHECK
   verifyMaxTravelDays(unit, longestDuration, timeDiffMins)
   - 'days':  timeDiffMins <= days_to_minutes(longestDuration)
   - 'weeks': timeDiffMins <= weeks_to_minutes(longestDuration)
   - Error: "Reservations must not exceed {X} {unit}"

6. CUSTOM PICKUP/RETURN HOUR CHECK
   verifyCustomPickupReturn(customAvailability, pickupDateTime, returnDateTime, ...)
   - Builds date range between pickup and return
   - Maps each date to its day-of-week availability rule
   - 'never' → false; 'always' → true
   - 'custom' → checks if dateTime falls within a 'free' custom hour slot (UTC)
   - Validates pickup and return independently
   - Error: "Pickup/Return unavailable for selected time on {dayName}"
```

### Price Calculation Pipeline
`calculateDurationPrice2()` → core formula:

```
remainingHours = totalHours % 24
addedMinsToHours = remainingHours + (remainingMinutes > 0 ? 1 : 0)
remainingHoursPrice = min(addedMinsToHours × hourlyRate, dailyRate)
durationPrice = (totalDays × dailyRate) + remainingHoursPrice

+ peakIncreasePrice (if pickup–return range includes peak days)
+ serviceFee = totalPrice × 10%
− longBookingDiscount (highest applicable tier, by % of post-peak price)
− advanceBookingDiscount (if advance booking qualifies)
```

---

## 9. Price Calculation Pipeline

File: `src/utils/Functions/reservationValidationFn.tsx`

```
INPUTS: startDate, endDate, dailyRates, hourlyRates, peakIncrease[], 
        longBookingDiscounts[], advanceBookingDiscounts[], customPricing[]

STEP 1 — Base Duration Price
  timeDiffMins    = endDate - startDate (minutes)
  timeDiffHours   = endDate - startDate (hours)
  timeDiffDays    = endDate - startDate (days)
  remainingHours  = timeDiffHours % 24
  remainingMins   = timeDiffMins % 60
  addedHours      = remainingHours + (remainingMins > 0 ? 1 : 0)
  remainingHoursPrice = min(addedHours × hourlyRate, dailyRate)
  durationPrice   = (timeDiffDays × dailyRate) + remainingHoursPrice

  NOTE: If customPricing[] overrides exist for dates in the range,
        the override dailyRates/hourlyRates replace base rates for those days.

STEP 2 — Peak Increase
  isDayOfWeekInRange(startDate, endDate, peakIncrease[])
    → finds peak days in the travel date range
  if matchedPeakDays.length > 0:
    if increaseType === 'percentage':
      incPrice = dailyRate × (percentage / 100) × matchedPeakDays.length
    else:
      incPrice = amount × matchedPeakDays.length
    totalPrice += incPrice

STEP 3 — Service Fee
  serviceFee = totalPrice × (serviceFeePercentage / 100)   // typically 10%
  NOTE: serviceFee is stored separately in basePrice.serviceFeeAmount
        and included in the displayed total but separated in invoicing.

STEP 4 — Long Booking Discount
  convertWeekToDays(longBookingDiscounts) → normalized to days
  filteredLongDiscounts = discounts where timeDiffDays >= convertedDays
  if filteredLongDiscounts.length > 0:
    pick highestDiscount (highest convertedDays)
    discountedAmount = totalPrice × (highestDiscount.percentage / 100)
    totalPrice -= discountedAmount
    → stored as discounts.longBookingDiscounts.calculatedAmount

STEP 5 — Advance Booking Discount
  Similar to Step 4 but based on how far ahead the booking is made.
  advanceTimeDiffInMin = diff(pickupDate, now) in minutes
  filteredAdvanceDiscounts = discounts where advance_days qualifies
  if filteredAdvanceDiscounts.length > 0:
    discountedAmount = totalPrice × (highestDiscount.percentage / 100)
    totalPrice -= discountedAmount
    → stored as discounts.advanceBookingDiscounts.calculatedAmount

STEP 6 — Voucher Discount (applied at checkout, post server validation)
  if discountType === 'percentage':
    voucherDiscount = min(totalPrice × (discountAmount / 100), maxDiscountAmount)
  else: (fixed)
    voucherDiscount = discountAmount
  totalPrice -= voucherDiscount
  → stored in additionalPaymentInfo.voucherAmountUsed

STEP 7 — Credit Application
  deductedCredit = min(creditInput, totalPrice)
  totalPrice -= deductedCredit
  → stored in additionalPaymentInfo.creditAmountUsed

FINAL OUTPUT → basePrice object passed to /reservation/create
```

---

## 10. Auth & Security Layer

### Access Token Flow
1. User logs in via NextAuth → access token stored in `localStorage.tashus.accessToken`.
2. `axiosClient` interceptor (request):
   - Reads token from localStorage on every request.
   - Injects `Authorization: Bearer <token>` header.
   - If no token: redirects to `/login?return_url=<current_path>`.
3. `axiosClient` interceptor (response):
   - On HTTP 401: clears localStorage, deletes auth cookies, calls `signOut()`, redirects to `/`.

### Route Protection (Middleware)
File: `src/middleware.ts`

Protected paths checked server-side via cookie:
```
/dashboard/:path*
/au/verify-account/:path*
/car-listing/:path*
/on-boarding/driver-verification/:path*
/payment/:path*
```
Unauthenticated → `302` redirect to `/login?return_url=<path>`.

### Public Routes (no auth)
```
/search (vehicle search)
/search/[vehicleId]/vehicle-details (vehicle detail)
/promotion/[voucherSlug] (voucher landing page)
/search/find-cars (API — no bearer token)
/reservation/block-dates-by-car/:id (API — no bearer token)
/voucher/get-common-vouchers (API — no bearer token)
/v2/voucher/slug/:slug (API — no bearer token)
```

### Authenticated API Calls
All dashboard, listing, reservation create/update, voucher validation, and payment calls require the Bearer token. The server validates token expiry and user role before processing.

---

*End of Blueprint — generated from static source analysis of `Tashus_Frontend_V1`.*
