import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { orgToTenantId, resolveOrgId } from '../lib/org.js'
import { groupMatches, resolveRole } from '../lib/rbac.js'
import { resolveKnowledgeBaseIds } from '../lib/weknora-policy.js'
import { buildUserIdentity } from '../lib/identity.js'

const baseConfig = {
  superAdminEmails: ['admin@company.com'],
  superAdminGroups: ['CN=CALB-AI-Admins,OU=Groups,DC=calb,DC=com'],
  adminGroups: ['CN=CALB-AI-Ops,OU=Groups,DC=calb,DC=com'],
  readonlyGroups: ['CN=CALB-AI-Viewers,OU=Groups,DC=calb,DC=com'],
  weknoraKbMap: {
    '研发部': ['kb-rd'],
    default: ['kb-common'],
  },
  weknoraKbGroupMap: {
    'CN=Exec,OU=Groups,DC=calb,DC=com': ['kb-exec'],
  },
  defaultKnowledgeBaseIds: ['kb-global'],
}

describe('org tenant ids', () => {
  it('maps department to stable tenant id', () => {
    const orgId = resolveOrgId({ orgIdAttribute: '', department: '研发部', company: '' })
    assert.equal(orgId, '研发部')
    assert.equal(orgToTenantId(orgId), orgToTenantId('研发部'))
    assert.notEqual(orgToTenantId(orgId), orgToTenantId('制造部'))
  })
})

describe('rbac', () => {
  it('matches LDAP group DN patterns', () => {
    assert.equal(
      groupMatches('CN=CALB-AI-Admins,OU=Groups,DC=calb,DC=com', 'CALB-AI-Admins'),
      true,
    )
  })

  it('resolves super admin by email and group', () => {
    assert.equal(
      resolveRole({ email: 'admin@company.com', groups: [] }, baseConfig),
      'super_admin',
    )
    assert.equal(
      resolveRole({ email: 'user@company.com', groups: ['CN=CALB-AI-Admins,OU=Groups,DC=calb,DC=com'] }, baseConfig),
      'super_admin',
    )
    assert.equal(
      resolveRole({ email: 'user@company.com', groups: ['CN=CALB-AI-Ops,OU=Groups,DC=calb,DC=com'] }, baseConfig),
      'admin',
    )
    assert.equal(
      resolveRole({ email: 'user@company.com', groups: ['CN=CALB-AI-Viewers,OU=Groups,DC=calb,DC=com'] }, baseConfig),
      'readonly',
    )
  })
})

describe('weknora kb policy', () => {
  it('prefers group map over department map', () => {
    const ids = resolveKnowledgeBaseIds({
      department: '研发部',
      groups: ['CN=Exec,OU=Groups,DC=calb,DC=com'],
    }, baseConfig)
    assert.deepEqual(ids, ['kb-exec'])
  })

  it('falls back to department then default', () => {
    assert.deepEqual(
      resolveKnowledgeBaseIds({ department: '研发部', groups: [] }, baseConfig),
      ['kb-rd'],
    )
    assert.deepEqual(
      resolveKnowledgeBaseIds({ department: '', groups: [] }, baseConfig),
      ['kb-common'],
    )
  })
})

describe('identity', () => {
  it('builds org-scoped tenant id', () => {
    const identity = buildUserIdentity({
      username: 'alice',
      email: 'alice@company.com',
      displayName: 'Alice',
      department: '研发部',
      groups: [],
    }, baseConfig)
    assert.equal(identity.orgId, '研发部')
    assert.equal(identity.tenantId, orgToTenantId('研发部'))
    assert.equal(identity.role, 'user')
  })
})
