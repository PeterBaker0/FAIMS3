/* eslint-disable n/no-process-exit */
import {createNotebook} from '../couchdb/notebooks';
import {readFileSync} from 'fs';

const extension = (filename: string) => {
  return (
    filename.substring(filename.lastIndexOf('.') + 1, filename.length) ||
    filename
  );
};

const loadProject = async (filename: string) => {
  try {
    const jsonText = readFileSync(filename, 'utf-8');
    const {metadata, 'ui-specification': uiSpec} = JSON.parse(jsonText);
    const projectName =
      typeof metadata?.name === 'string' && metadata.name.trim().length > 0
        ? metadata.name.trim()
        : 'imported-project';

    const projectID = await createNotebook({
      project: {name: projectName},
      notebook: {
        metadata,
        'ui-specification': uiSpec,
      },
    });
    console.log('created project', projectID);
    process.exit(0);
  } catch (error) {
    console.error('Project import failed:', error);
  }
};

const main = async () => {
  if (process.argv.length > 2) {
    const files = process.argv.slice(2);
    files.forEach(filename => {
      if (extension(filename) === 'json') {
        loadProject(filename);
      }
    });
  }
};

main();
