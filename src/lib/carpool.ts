// Shared carpool types for the event page's rides board.

export interface RidePassenger {
  id: string;
  name: string;
}

export interface Ride {
  id: string;
  driverId: string;
  driverName: string;
  seats: number;
  note: string | null;
  passengers: RidePassenger[];
  seatsLeft: number;
  /** The active persona is the driver of this ride. */
  isMine: boolean;
  /** The active persona holds a seat in this ride. */
  iAmIn: boolean;
}
