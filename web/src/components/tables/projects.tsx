import {NOTEBOOK_NAME_CAPITALIZED} from '@/constants';
import {GetNotebookListResponse} from '@faims3/data-model';
import {ColumnDef} from '@tanstack/react-table';
import {DataTableColumnHeader} from '../data-table/column-header';
import {TeamCellComponent} from './cells/team-cell';
import {TemplateCellComponent} from './cells/template-cell';
import {
  getProjectLead,
  getProjectDescription,
} from '@/utils/projectMetadata';

export const columns: ColumnDef<GetNotebookListResponse[number]>[] = [
  {
    id: 'name',
    accessorFn: row => row.project?.name ?? row.name,
    header: ({column}) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
  },
  {
    id: 'team',
    accessorFn: row => row.project?.teamId ?? row.ownedByTeamId,
    header: ({column}) => (
      <DataTableColumnHeader column={column} title="Team" />
    ),
    cell: ({
      row: {
        original,
      },
    }) => {
      const teamId = original.project?.teamId ?? original.ownedByTeamId;
      return teamId ? (
        <TeamCellComponent teamId={teamId} />
      ) : null;
    },
  },
  {
    id: 'template',
    accessorFn: row => row.project?.templateId ?? row.template_id,
    header: ({column}) => (
      <DataTableColumnHeader column={column} title="Template" />
    ),
    cell: ({
      row: {
        original,
      },
    }) => {
      const templateId = original.project?.templateId ?? original.template_id;
      return templateId ? (
        <TemplateCellComponent templateId={templateId} />
      ) : null;
    },
  },
  {
    id: 'projectLead',
    accessorFn: row => getProjectLead(row.metadata),
    header: ({column}) => (
      <DataTableColumnHeader
        column={column}
        title={`${NOTEBOOK_NAME_CAPITALIZED} Lead`}
      />
    ),
  },
  {
    id: 'description',
    accessorFn: row => getProjectDescription(row.metadata),
    header: ({column}) => (
      <DataTableColumnHeader column={column} title="Description" />
    ),
  },
];
