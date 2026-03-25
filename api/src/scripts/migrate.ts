/* eslint-disable n/no-process-exit */
import {initialiseAndMigrateDBs} from '../couchdb';

/**
 * Main function to run database initialisation and migration
 * Accepts optional --keys flag to control whether public keys should be pushed
 */
const main = async () => {
  try {
    // Check if --keys flag is present in command line arguments
    const pushKeys = process.argv.includes('--keys');
    const dryRun = process.argv.includes('--dry-run');
    const cleanup = process.argv.includes('--cleanup');

    // Log whether keys will be configured
    console.log(
      `Public keys will ${pushKeys ? '' : 'not '}be configured during migration`
    );
    console.log(
      `Legacy metadata DB consolidation running in ${dryRun ? 'dry-run' : 'write'} mode`
    );
    if (cleanup) {
      console.log('Legacy metadata DB cleanup enabled.');
    }

    // Run database initialisation and migration with force and pushKeys parameters
    await initialiseAndMigrateDBs({
      force: true,
      pushKeys: pushKeys,
      metadataDryRun: dryRun,
      metadataCleanup: cleanup,
    });

    console.log('Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

// Execute the main function
main();
