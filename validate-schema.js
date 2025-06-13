import Ajv from 'ajv';
import chalk from 'chalk';

// The corrected schema
const schema = {
  "type": "object",
  "properties": {
    "externalID": {
      "type": "string",
      "description": "External booking reference ID"
    },
    "date": {
      "type": "string",
      "description": "Reservation date in YYYY-MM-DD or ISO datetime format"
    },
    "time": {
      "type": "string",
      "description": "Reservation time in HH:MM (24-h) - optional if date is ISO format"
    },
    "persons": {
      "type": "integer",
      "minimum": 1,
      "description": "Total number of guests"
    },
    "name": {
      "type": "string",
      "description": "Guest full name"
    },
    "mobile": {
      "type": "string",
      "pattern": "^[0-9]+$",
      "description": "Guest phone number (digits only, including country code)"
    },
    "comment": {
      "type": "string",
      "description": "Special requests / seating prefs",
      "default": ""
    },
    "autoTable": {
      "type": "boolean",
      "description": "Let EasyTable pick the table",
      "default": true
    },
    "emailNotifications": {
      "type": "integer",
      "enum": [0, 1],
      "description": "Send confirmation email? 1 = yes",
      "default": 1
    },
    "smsNotifications": {
      "type": "integer",
      "enum": [0, 1],
      "description": "Send confirmation SMS? 1 = yes",
      "default": 1
    }
  },
  "required": ["externalID", "date", "persons", "name", "mobile"]
};

// Test payloads - matching your working code
const testPayloads = [
  // Split mode payload (your working payload)
  {
    name: "Split mode (working payload)",
    data: {
      externalID: `probe-${Date.now()}`,
      persons: 2,
      name: 'Alex Johnson',
      mobile: '15551234567',
      comment: 'Prefers indoor seating',
      autoTable: true,
      emailNotifications: 1,
      smsNotifications: 1,
      date: '2025-06-13',
      time: '20:00'
    }
  },
  // ISO mode payload (your working payload)
  {
    name: "ISO mode (working payload)",
    data: {
      externalID: `probe-${Date.now()}`,
      persons: 2,
      name: 'Alex Johnson',
      mobile: '15551234567',
      comment: 'Prefers indoor seating',
      autoTable: true,
      emailNotifications: 1,
      smsNotifications: 1,
      date: '2025-06-13T20:00:00Z'
    }
  },
  // Minimal required fields only
  {
    name: "Minimal required fields",
    data: {
      externalID: "test-123",
      date: "2025-06-13",
      persons: 1,
      name: "John Doe",
      mobile: "1234567890"
    }
  },
  // Invalid payload - missing required field
  {
    name: "Invalid - missing externalID",
    data: {
      date: "2025-06-13",
      persons: 1,
      name: "John Doe",
      mobile: "1234567890"
    },
    shouldFail: true
  },
  // Invalid payload - bad mobile format
  {
    name: "Invalid - mobile with non-digits",
    data: {
      externalID: "test-123",
      date: "2025-06-13",
      persons: 1,
      name: "John Doe",
      mobile: "+1-555-123-4567"
    },
    shouldFail: true
  }
];

const ajv = new Ajv();
const validate = ajv.compile(schema);

console.log(chalk.cyan('🔍 Testing Schema Validation\n'));

let passed = 0;
let failed = 0;

testPayloads.forEach((test, index) => {
  const valid = validate(test.data);
  const shouldPass = !test.shouldFail;
  
  console.log(chalk.blue(`Test ${index + 1}: ${test.name}`));
  
  if (valid === shouldPass) {
    console.log(chalk.green('✅ PASS'));
    passed++;
  } else {
    console.log(chalk.red('❌ FAIL'));
    if (!valid) {
      console.log(chalk.red('   Validation errors:'));
      validate.errors?.forEach(error => {
        console.log(chalk.red(`   - ${error.instancePath || 'root'}: ${error.message}`));
      });
    }
    failed++;
  }
  console.log('');
});

console.log(chalk.cyan(`\n📊 Results: ${chalk.green(passed + ' passed')}, ${chalk.red(failed + ' failed')}`));

if (failed === 0) {
  console.log(chalk.green('🎉 All tests passed! Schema is working correctly.'));
} else {
  console.log(chalk.red('⚠️  Some tests failed. Schema may need adjustment.'));
  process.exit(1);
} 