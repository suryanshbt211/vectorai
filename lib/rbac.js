'use strict';
// Role-based access control. Permissions are checked on the server for every request.
const PERMS = {
  'orgs.manage': 'Create, edit and disable customer organizations (Vector operators only)',
  'ops.view': 'See deployments and health across all organizations (Vector operators only)',
  'org.read': 'View organization profile and settings',
  'org.manage': 'Edit organization profile, industry and jurisdictions',
  'users.read': 'View users',
  'users.manage': 'Create, edit, disable and delete users',
  'roles.manage': 'Create, edit and delete custom roles',
  'infra.read': 'View infrastructure, GPUs and nodes',
  'infra.manage': 'Add, edit and remove inference nodes',
  'models.read': 'View installed models and the model catalog',
  'models.manage': 'Download and delete models',
  'deployments.read': 'View deployments',
  'deployments.manage': 'Create, start, stop, edit, benchmark and delete deployments',
  'knowledge.read': 'Search and read knowledge documents allowed for the user\'s department',
  'knowledge.manage': 'Add, edit and delete knowledge documents',
  'knowledge.all': 'Access knowledge documents from every department',
  'chat.use': 'Use the private AI workspace',
  'compliance.read': 'View the obligations that apply to the organization',
  'compliance.manage': 'Set obligation status and owners, add custom obligations, export reports',
  'evidence.manage': 'Add and delete compliance evidence',
  'audit.read': 'View the audit ledger',
  'audit.verify': 'Verify the audit ledger hash chain',
  'audit.export': 'Export the audit ledger',
};
const PLATFORM_ONLY = ['orgs.manage', 'ops.view'];
const ORG_PERMS = Object.keys(PERMS).filter((p) => !PLATFORM_ONLY.includes(p));

const BUILTIN = {
  operator: { name: 'Vector Operator', scope: 'platform', perms: ['orgs.manage', 'ops.view', 'infra.read', 'models.read', 'deployments.read', 'audit.read', 'audit.verify'],
    desc: 'Vector team. Sees deployment health across organizations. No access to documents, prompts or outputs.' },
  owner: { name: 'Organization Owner', scope: 'org', perms: ORG_PERMS, desc: 'Full control of the organization.' },
  platform_admin: { name: 'Platform Administrator', scope: 'org',
    perms: ['org.read', 'users.read', 'infra.read', 'infra.manage', 'models.read', 'models.manage', 'deployments.read', 'deployments.manage', 'chat.use', 'audit.read', 'compliance.read'],
    desc: 'Infrastructure, models and deployments.' },
  ai_engineer: { name: 'AI Engineer', scope: 'org',
    perms: ['org.read', 'infra.read', 'models.read', 'models.manage', 'deployments.read', 'deployments.manage', 'knowledge.read', 'knowledge.manage', 'knowledge.all', 'chat.use', 'compliance.read'],
    desc: 'Models, deployments and knowledge sources.' },
  security_admin: { name: 'Security Administrator', scope: 'org',
    perms: ['org.read', 'users.read', 'users.manage', 'roles.manage', 'infra.read', 'deployments.read', 'audit.read', 'audit.verify', 'audit.export', 'compliance.read'],
    desc: 'Users, roles and the audit ledger.' },
  compliance_officer: { name: 'Compliance Officer', scope: 'org',
    perms: ['org.read', 'deployments.read', 'chat.use', 'knowledge.read', 'compliance.read', 'compliance.manage', 'evidence.manage', 'audit.read'],
    desc: 'Obligations, evidence and reports.' },
  dept_admin: { name: 'Department Administrator', scope: 'org',
    perms: ['users.read', 'knowledge.read', 'knowledge.manage', 'chat.use', 'compliance.read'],
    desc: 'Knowledge documents for their own department.' },
  employee: { name: 'Employee', scope: 'org', perms: ['chat.use', 'knowledge.read', 'compliance.read'], desc: 'Private AI workspace and the compliance obligations that apply.' },
  auditor: { name: 'Auditor', scope: 'org',
    perms: ['org.read', 'users.read', 'deployments.read', 'compliance.read', 'audit.read', 'audit.verify', 'audit.export'],
    desc: 'Read-only access to audit evidence.' },
};

function roleFor(store, roleId, orgId) {
  if (BUILTIN[roleId]) return { id: roleId, builtin: true, ...BUILTIN[roleId] };
  const r = store.roles.get(roleId);
  if (r && r.orgId === orgId) return { ...r, builtin: false, scope: 'org' };
  return null;
}
function permsOf(store, user) {
  const r = roleFor(store, user.roleId, user.orgId);
  return r ? r.perms : [];
}
const can = (perms, p) => perms.includes(p);
const isSubset = (child, parent) => child.every((p) => parent.includes(p));

module.exports = { PERMS, ORG_PERMS, PLATFORM_ONLY, BUILTIN, roleFor, permsOf, can, isSubset };
