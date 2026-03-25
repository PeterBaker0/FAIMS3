import {useAuth} from '@/context/auth-provider';
import {Form} from '@/components/form';
import {readFileAsText} from '@/lib/utils';
import {z} from 'zod';
import {NOTEBOOK_NAME} from '@/constants';
import {Route} from '@/routes/_protected/projects/$projectId';
import {useGetProject} from '@/hooks/queries';
import {Field} from '../form';

const fields: Field[] = [
  {
    name: 'name',
    label: 'Name',
    schema: z.string().trim().min(5, {
      message: 'Project name must be at least 5 characters.',
    }),
  },
  {
    name: 'description',
    label: 'Description',
    schema: z.string().optional(),
  },
  {
    name: 'teamId',
    label: 'Team ID (optional)',
    schema: z.string().trim().optional(),
  },
  {
    name: 'file',
    label: 'JSON file (optional)',
    type: 'file',
    schema: z
      .instanceof(File)
      .refine(file => file.type === 'application/json')
      .optional(),
  },
];

/**
 * UpdateProjectForm component renders a form for updating a project.
 * It provides a button to submit the form and a file input for selecting a JSON file.
 * The onSuccess callback is called after a successful update.
 *
 * @param {React.Dispatch<React.SetStateAction<boolean>>} setDialogOpen - A function to set the dialog open state.
 * @returns {JSX.Element} The rendered UpdateProjectForm component.
 */
export function UpdateProjectForm({
  setDialogOpen,
  onSuccess,
}: {
  setDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  onSuccess: () => void;
}) {
  const {user} = useAuth();
  const {projectId} = Route.useParams();
  const {data: projectData} = useGetProject({user, projectId});

  const onSubmit = async ({
    file,
    name,
    description,
    teamId,
  }: {
    file?: File;
    name: string;
    description?: string;
    teamId?: string;
  }) => {
    if (!user) return {type: 'submit', message: 'User not authenticated'};
    const payload: {
      project?: {
        name?: string;
        description?: string;
        teamId?: string;
      };
      notebook?: {
        metadata: unknown;
        'ui-specification': Record<string, unknown>;
      };
    } = {
      project: {
        name: name.trim(),
        description: description?.trim() || undefined,
        teamId: teamId?.trim() || undefined,
      },
    };

    if (file) {
      const jsonString = await readFileAsText(file);
      if (!jsonString) return {type: 'submit', message: 'Error reading file'};
      let parsed: {
        metadata?: unknown;
        'ui-specification'?: Record<string, unknown>;
      };
      try {
        parsed = JSON.parse(jsonString) as {
          metadata?: unknown;
          'ui-specification'?: Record<string, unknown>;
        };
      } catch {
        return {
          type: 'submit',
          message: 'Invalid JSON file format.',
        };
      }

      if (!parsed.metadata || !parsed['ui-specification']) {
        return {
          type: 'submit',
          message:
            "Invalid JSON file. Expected both 'metadata' and 'ui-specification'.",
        };
      }

      payload.notebook = {
        metadata: parsed.metadata,
        'ui-specification': parsed['ui-specification'],
      };
    }

    const response = await fetch(
      `${import.meta.env.VITE_API_URL}/api/notebooks/${projectId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok)
      return {type: 'submit', message: 'Error updating project'};

    // call the onSuccess callback if everything worked
    onSuccess();

    setDialogOpen(false);
  };

  return (
    <Form
      fields={fields}
      onSubmit={onSubmit}
      submitButtonText={`Update ${NOTEBOOK_NAME}`}
      submitButtonVariant="destructive"
      warningMessage={
        "If the project's response format has changed, there will be inconsistences in responses."
      }
      defaultValues={{
        name: projectData?.project?.name ?? projectData?.name ?? '',
        description: projectData?.project?.description ?? '',
        teamId: projectData?.project?.teamId ?? '',
      }}
    />
  );
}
