export type VenueWeatherProfile = {
  latitude: number
  longitude: number
  roof: 'outdoor' | 'canopy' | 'retractable' | 'enclosed'
}

const VENUE_WEATHER: Record<string, VenueWeatherProfile> = {
  'AT&T Stadium': { latitude: 32.7473, longitude: -97.0945, roof: 'retractable' },
  'Acrisure Stadium': { latitude: 40.4468, longitude: -80.0158, roof: 'outdoor' },
  'Allegiant Stadium': { latitude: 36.0908, longitude: -115.1830, roof: 'enclosed' },
  'Bank of America Stadium': { latitude: 35.2258, longitude: -80.8528, roof: 'outdoor' },
  'Caesars Superdome': { latitude: 29.9511, longitude: -90.0812, roof: 'enclosed' },
  'Empower Field at Mile High': { latitude: 39.7439, longitude: -105.0201, roof: 'outdoor' },
  'EverBank Stadium': { latitude: 30.3239, longitude: -81.6373, roof: 'outdoor' },
  'Ford Field': { latitude: 42.34, longitude: -83.0456, roof: 'enclosed' },
  'GEHA Field at Arrowhead Stadium': { latitude: 39.0489, longitude: -94.4839, roof: 'outdoor' },
  'Gillette Stadium': { latitude: 42.0909, longitude: -71.2643, roof: 'outdoor' },
  'Hard Rock Stadium': { latitude: 25.958, longitude: -80.2389, roof: 'canopy' },
  'Highmark Stadium': { latitude: 42.7738, longitude: -78.787, roof: 'outdoor' },
  'Huntington Bank Field': { latitude: 41.5061, longitude: -81.6995, roof: 'outdoor' },
  'Lambeau Field': { latitude: 44.5013, longitude: -88.0622, roof: 'outdoor' },
  "Levi's Stadium": { latitude: 37.403, longitude: -121.9698, roof: 'outdoor' },
  'Lincoln Financial Field': { latitude: 39.9008, longitude: -75.1675, roof: 'outdoor' },
  'Lucas Oil Stadium': { latitude: 39.7601, longitude: -86.1639, roof: 'retractable' },
  'Lumen Field': { latitude: 47.5952, longitude: -122.3316, roof: 'outdoor' },
  'M&T Bank Stadium': { latitude: 39.2779, longitude: -76.6227, roof: 'outdoor' },
  'Mercedes-Benz Stadium': { latitude: 33.7553, longitude: -84.4006, roof: 'retractable' },
  'MetLife Stadium': { latitude: 40.8135, longitude: -74.0745, roof: 'outdoor' },
  'NRG Stadium': { latitude: 29.6847, longitude: -95.4107, roof: 'retractable' },
  'Nissan Stadium': { latitude: 36.1665, longitude: -86.7713, roof: 'outdoor' },
  'Northwest Stadium': { latitude: 38.9076, longitude: -76.8645, roof: 'outdoor' },
  'Paycor Stadium': { latitude: 39.0954, longitude: -84.516, roof: 'outdoor' },
  'Raymond James Stadium': { latitude: 27.9759, longitude: -82.5033, roof: 'outdoor' },
  'SoFi Stadium': { latitude: 33.9535, longitude: -118.3392, roof: 'canopy' },
  'Soldier Field': { latitude: 41.8623, longitude: -87.6167, roof: 'outdoor' },
  'State Farm Stadium': { latitude: 33.5276, longitude: -112.2626, roof: 'retractable' },
  'U.S. Bank Stadium': { latitude: 44.9738, longitude: -93.2577, roof: 'enclosed' },
}

export function getVenueWeatherProfile(venue?: string): VenueWeatherProfile | null {
  return venue ? VENUE_WEATHER[venue] ?? null : null
}
