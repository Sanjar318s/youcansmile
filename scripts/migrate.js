require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
const { runSchema } = require('../lib/db');

runSchema()
  .then(() => {
    console.log('Schema applied.');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
