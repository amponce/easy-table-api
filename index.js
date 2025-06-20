// -----------------------------------------------------------------------------
// easytable-probe.mjs       - quick sanity check for /v2/bookings
// -----------------------------------------------------------------------------
// 1️⃣  npm install axios dotenv chalk
// 2️⃣  Put your creds in a .env file:
//     EASYTABLE_API_KEY=key
//     EASYTABLE_PLACE_TOKEN=token
// 3️⃣  node index.mjs [iso|split]
// -----------------------------------------------------------------------------
// 
// CORRECTED SCHEMA (aligned with working payload):
// {
//   "type": "object",
//   "properties": {
//     "externalID": {
//       "type": "string",
//       "description": "External booking reference ID"
//     },
//     "date": {
//       "type": "string",
//       "description": "Reservation date in YYYY-MM-DD or ISO datetime format"
//     },
//     "time": {
//       "type": "string",
//       "description": "Reservation time in HH:MM (24-h) - optional if date is ISO format"
//     },
//     "persons": {
//       "type": "integer",
//       "minimum": 1,
//       "description": "Total number of guests"
//     },
//     "name": {
//       "type": "string",
//       "description": "Guest full name"
//     },
//     "mobile": {
//       "type": "string",
//       "pattern": "^[0-9]+$",
//       "description": "Guest phone number (digits only, including country code)"
//     },
//     "comment": {
//       "type": "string",
//       "description": "Special requests / seating prefs",
//       "default": ""
//     },
//     "autoTable": {
//       "type": "boolean",
//       "description": "Let EasyTable pick the table",
//       "default": true
//     },
//     "emailNotifications": {
//       "type": "integer",
//       "enum": [0, 1],
//       "description": "Send confirmation email? 1 = yes",
//       "default": 1
//     },
//     "smsNotifications": {
//       "type": "integer",
//       "enum": [0, 1],
//       "description": "Send confirmation SMS? 1 = yes",
//       "default": 1
//     }
//   },
//   "required": ["externalID", "date", "persons", "name", "mobile"]
// }
// -----------------------------------------------------------------------------
import 'dotenv/config';
import axios from 'axios';
import chalk from 'chalk';

const API_KEY     = process.env.EASYTABLE_API_KEY?.trim();
const PLACE_TOKEN = process.env.EASYTABLE_PLACE_TOKEN?.trim();

if (!API_KEY || !PLACE_TOKEN) {
  console.error(chalk.red('❌   Missing EASYTABLE_API_KEY or EASYTABLE_PLACE_TOKEN'));
  process.exit(1);
}

// Pick payload mode from CLI arg:  iso (=embed time in date)  or  split (=date + time)
const mode = (process.argv[2] ?? 'split').toLowerCase();

const base = {
  externalID:  `probe-${Date.now()}`,
  persons:     2,
  name:        'Alex Johnson',
  mobile:      '15551234567',     // digits-only
  comment:     'Prefers indoor seating',
  autoTable:   true,
  emailNotifications: 1,
  smsNotifications:   1
};

const payload =
  mode === 'split'
    ? {
        ...base,
        date: '2025-07-15',       // plain date
        time: '20:00'             // separate 24-h time
      }
    : {
        ...base,
        date: '2025-07-15T20:00:00Z' // ISO date-time
        // (no separate time field)
      };

console.log(chalk.cyan('\n▶ Sending payload:\n'), payload);

try {
  const { data, status } = await axios.post(
    'https://api.easytable.com/v2/bookings',
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key':     API_KEY,
        'X-Place-Token': PLACE_TOKEN
      },
      timeout: 10_000
    }
  );

  console.log(chalk.green(`\n✅  HTTP ${status}`));
  console.dir(data, { depth: null, colors: true });
} catch (err) {
  if (err.response) {
    console.log(chalk.red(`\n❌  HTTP ${err.response.status}`));
    console.dir(err.response.data, { depth: null, colors: true });
  } else {
    console.error(chalk.red('\n❌  Request failed:'), err.message);
  }
}