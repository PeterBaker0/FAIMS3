import {TemplateDocument} from '@faims3/data-model';
import {ColumnDef} from '@tanstack/react-table';
import {DataTableColumnHeader} from '../data-table/column-header';
import {RoleCard} from '../ui/role-card';
import {TeamCellComponent} from './cells/team-cell';
import {NOTEBOOK_NAME_CAPITALIZED} from '@/constants';
import {
  getMetadataDescription,
  getMetadataProjectLead,
  getMetadataProjectStatus,
} from '@/utils/projectMetadata';

export type Column = TemplateDocument;

export const columns: ColumnDef<Column>[] = [
  {
    accessorKey: 'name',
    header: ({column}) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
  },
  {
    id: 'team',
    accessorKey: 'ownedByTeamId',
    header: ({column}) => (
      <DataTableColumnHeader column={column} title="Team" />
    ),
    cell: ({
      row: {
        original: {ownedByTeamId},
      },
    }) => {
      return ownedByTeamId ? (
        <TeamCellComponent teamId={ownedByTeamId} />
      ) : null;
    },
  },
  {
    id: 'project_status',
    accessorFn: row => getMetadataProjectStatus(row.metadata),
    header: ({column}) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({
      row: {
        original: {metadata},
      },
    }) => <RoleCard>{getMetadataProjectStatus(metadata)}</RoleCard>,
  },
  {
    id: 'project_lead',
    accessorFn: row => getMetadataProjectLead(row.metadata),
    header: ({column}) => (
      <DataTableColumnHeader
        column={column}
        title={`${NOTEBOOK_NAME_CAPITALIZED} Lead`}
      />
    ),
  },
  {
    id: 'pre_description',
    accessorFn: row => getMetadataDescription(row.metadata),
    header: ({column}) => (
      <DataTableColumnHeader column={column} title="Description" />
    ),
  },
];
