import type { Page } from '@playwright/test'

import {
  E2E_BOOTSTRAP_STORAGE_KEY,
  type E2EBootstrapSeed,
} from '@/shared/infrastructure/e2eBootstrap'
import { authRealmKey } from '@/shared/infrastructure/session/authRealm'

export async function installE2EBootstrapSeed(page: Page, seed: E2EBootstrapSeed): Promise<void> {
  const seedAuthRealmKey = authRealmKey({
    launchMode: seed.appSettings?.launchMode === 'local' ? 'local' : 'cloud',
    apiBaseURL: seed.appSettings?.apiBaseURL ?? '',
    cloudAPIBaseURL: seed.appSettings?.cloudAPIBaseURL ?? '',
    daemonGatewayBaseURL: seed.appSettings?.daemonGatewayBaseURL ?? '',
  })
  await page.addInitScript(({ bootstrapKey, seed, seedAuthRealmKey }) => {
    window.localStorage.setItem(bootstrapKey, JSON.stringify(seed))
    window.localStorage.setItem('movscript.language', 'zh-CN')
    if (seed.user) {
      const memberships = seed.user.org_memberships ?? []
      const currentOrgID = memberships.find((membership) => membership.is_personal)?.org_id
        ?? memberships[0]?.org_id
        ?? null
      const activeRealmKey = seedAuthRealmKey
      const sessionSnapshot = {
        currentUser: seed.user.user,
        token: seed.user.token ?? null,
        tokenExpiresAt: seed.user.expires_at ?? null,
        gitCredential: seed.user.git_credential ?? null,
        orgMemberships: memberships,
        currentOrgID,
      }
      window.localStorage.setItem('movscript-user', JSON.stringify({
        state: {
          ...sessionSnapshot,
          activeRealmKey,
          sessionsByRealm: {
            [activeRealmKey]: sessionSnapshot,
          },
          hydrated: true,
        },
        version: 0,
      }))
    }
    if (seed.project) {
      window.localStorage.setItem('movscript-project', JSON.stringify({
        state: {
          current: seed.project,
          currentProjectId: seed.project.ID,
          workspaceRoot: null,
          lastRoute: null,
          syncStatus: 'idle',
          dirtyScopes: [],
          hydrated: true,
        },
        version: 0,
      }))
    }
  }, {
    bootstrapKey: E2E_BOOTSTRAP_STORAGE_KEY,
    seed,
    seedAuthRealmKey,
  })
}
