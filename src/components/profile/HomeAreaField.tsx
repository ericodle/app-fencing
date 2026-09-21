import { useState } from 'react'
import { t } from '../../i18n'
import { clubConfig } from '../../config/club'
import { haversineKm } from '../../lib/geo'
import { Field, inputClass } from '../ui/Field'

// Where a member travels from, for the meetup planner.
//
// Coarse on purpose, and the UI is where that promise is kept. It asks for a
// neighborhood and a rough pin, never a street address, and the label is the
// only part other members ever see — the coordinates go to the planner and
// nowhere else. A club roster is not a place to keep home addresses, and a
// feature that needed them would not be worth having.
//
// Two ways to set the pin, because both fail differently: the browser's
// geolocation (exact, but refused by half of everyone and wrong if you set it
// from the office), and a short list of the districts this club actually draws
// from (approximate, but always available and never embarrassing).

interface District { label: string; lat: number; lng: number }

// The districts a Taipei club draws from, with a representative point in each.
// A club elsewhere replaces this list; it is deliberately data, not a geocoder
// call, so the field works offline and sends nothing anywhere.
const DISTRICTS: District[] = [
  { label: 'Zhongzheng', lat: 25.0324, lng: 121.5180 },
  { label: 'Datong',     lat: 25.0630, lng: 121.5150 },
  { label: 'Zhongshan',  lat: 25.0640, lng: 121.5260 },
  { label: 'Songshan',   lat: 25.0600, lng: 121.5580 },
  { label: 'Daan',       lat: 25.0263, lng: 121.5436 },
  { label: 'Wanhua',     lat: 25.0280, lng: 121.4990 },
  { label: 'Xinyi',      lat: 25.0330, lng: 121.5650 },
  { label: 'Shilin',     lat: 25.0880, lng: 121.5250 },
  { label: 'Beitou',     lat: 25.1320, lng: 121.5010 },
  { label: 'Neihu',      lat: 25.0830, lng: 121.5940 },
  { label: 'Nangang',    lat: 25.0538, lng: 121.6066 },
  { label: 'Wenshan',    lat: 24.9890, lng: 121.5700 },
  { label: 'Banqiao',    lat: 25.0143, lng: 121.4672 },
  { label: 'Xinzhuang',  lat: 25.0360, lng: 121.4500 },
  { label: 'Zhonghe',    lat: 25.0000, lng: 121.4990 },
  { label: 'Yonghe',     lat: 25.0100, lng: 121.5150 },
  { label: 'Sanchong',   lat: 25.0620, lng: 121.4870 },
  { label: 'Xindian',    lat: 24.9670, lng: 121.5420 },
  { label: 'Tamsui',     lat: 25.1677, lng: 121.4406 },
  { label: 'Xizhi',      lat: 25.0650, lng: 121.6420 },
]

export function HomeAreaField({
  label, lat, lng, onChange,
}: {
  label: string
  lat: number | null
  lng: number | null
  onChange: (label: string, lat: number | null, lng: number | null) => void
}) {
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState<string | null>(null)

  const hasPin = lat !== null && lng !== null
  const fromClub = hasPin
    ? haversineKm({ lat, lng }, { lat: clubConfig.club.home.latitude, lng: clubConfig.club.home.longitude })
    : null

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocateError('This browser cannot find your location. Pick a district instead.')
      return
    }
    setLocating(true)
    setLocateError(null)
    navigator.geolocation.getCurrentPosition(
      position => {
        // Rounded to three decimals — about 100 m. Precise enough for a
        // planner working in kilometers, and not a doorstep.
        const round = (n: number) => Math.round(n * 1000) / 1000
        onChange(label || 'My area', round(position.coords.latitude), round(position.coords.longitude))
        setLocating(false)
      },
      () => {
        setLocateError('Could not get your location. Pick a district instead.')
        setLocating(false)
      },
      { timeout: 10_000, maximumAge: 600_000 },
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label={t.profile.homeArea} htmlFor="home-district" help={t.profile.homeAreaHelp}>
        <select
          id="home-district"
          className={inputClass}
          value={DISTRICTS.some(d => d.label === label) ? label : ''}
          onChange={e => {
            const district = DISTRICTS.find(d => d.label === e.target.value)
            if (district) onChange(district.label, district.lat, district.lng)
            else onChange('', null, null)
          }}
        >
          <option value="">{t.common.notSet}</option>
          {DISTRICTS.map(d => <option key={d.label} value={d.label}>{d.label}</option>)}
        </select>
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="min-h-11 border border-rule px-3 py-1.5 text-sm text-silver hover:border-gold hover:text-gold disabled:opacity-50"
        >
          {locating ? 'Finding you…' : 'Use my current location instead'}
        </button>
        {hasPin && (
          <span className="figures text-sm text-muted">
            {lat.toFixed(3)}, {lng.toFixed(3)}
            {fromClub !== null && ` · ${fromClub.toFixed(1)} km from the club`}
          </span>
        )}
        {hasPin && (
          <button
            type="button"
            onClick={() => onChange('', null, null)}
            className="text-sm text-muted-dim hover:text-signal-red"
          >
            Clear
          </button>
        )}
      </div>

      {locateError && <p className="text-sm text-signal-amber">{locateError}</p>}

      {!hasPin && (
        <p className="border-l-2 border-gold-deep pl-3 text-sm text-muted">
          Without this you are left out of the meetup planner, and the club will
          pick a venue without counting your journey.
        </p>
      )}
    </div>
  )
}
