export default {
  forbidden: [
    {
      name: 'contracts-have-no-application-dependencies',
      severity: 'error',
      from: { path: '^packages/contracts/' },
      to: { path: '^(apps|server|src|packages/scheduling-domain)/' }
    },
    {
      name: 'scheduling-domain-does-not-import-applications',
      severity: 'error',
      from: { path: '^packages/scheduling-domain/src/' },
      to: { path: '^(apps|server|src)/' }
    },
    {
      name: 'api-domain-points-inward',
      severity: 'error',
      from: { path: '^apps/api/src/modules/[^/]+/domain/' },
      to: { path: '^apps/api/src/(app|infrastructure)/|/adapters/' }
    },
    {
      name: 'web-domain-is-framework-independent',
      severity: 'error',
      from: { path: '^apps/web/src/modules/[^/]+/domain/' },
      to: { path: '^(react|react-dom|react-router|@tanstack)/' }
    },
    {
      name: 'applications-do-not-import-each-other',
      severity: 'error',
      from: { path: '^apps/api/' },
      to: { path: '^apps/web/' }
    }
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.json']
    },
    reporterOptions: {
      dot: { collapsePattern: 'node_modules/[^/]+' }
    }
  }
};
