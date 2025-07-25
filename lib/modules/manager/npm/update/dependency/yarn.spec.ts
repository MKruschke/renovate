import { codeBlock } from 'common-tags';
import * as npmUpdater from '../..';

describe('modules/manager/npm/update/dependency/yarn', () => {
  it('handles implicit default catalog dependency', () => {
    const upgrade = {
      depType: 'yarn.catalog.default',
      depName: 'react',
      newValue: '19.0.0',
    };
    const yarnrcWYaml = codeBlock`
      nodeLinker: node-modules

      plugins:
        - checksum: 4cb9601cfc0c71e5b0ffd0a85b78e37430b62257040714c2558298ce1fc058f4e918903f0d1747a4fef3f58e15722c35bd76d27492d9d08aa5b04e235bf43b22
          path: .yarn/plugins/@yarnpkg/plugin-catalogs.cjs
          spec: 'https://raw.githubusercontent.com/toss/yarn-plugin-catalogs/main/bundles/%40yarnpkg/plugin-catalogs.js'

      catalogs:
        list:
          react: 18.3.1
    `;
    const testContent = npmUpdater.updateDependency({
      fileContent: yarnrcWYaml,
      upgrade,
    });
    expect(testContent).toEqual(codeBlock`
      nodeLinker: node-modules

      plugins:
        - checksum: 4cb9601cfc0c71e5b0ffd0a85b78e37430b62257040714c2558298ce1fc058f4e918903f0d1747a4fef3f58e15722c35bd76d27492d9d08aa5b04e235bf43b22
          path: .yarn/plugins/@yarnpkg/plugin-catalogs.cjs
          spec: 'https://raw.githubusercontent.com/toss/yarn-plugin-catalogs/main/bundles/%40yarnpkg/plugin-catalogs.js'

      catalogs:
        list:
          react: 19.0.0
    `);
  });

  it('handles explicit named catalog dependency', () => {
    const upgrade = {
      depType: 'yarn.catalog.react17',
      depName: 'react',
      newValue: '19.0.0',
    };
    const yarnrcWYaml = codeBlock`
      nodeLinker: node-modules

      plugins:
        - checksum: 4cb9601cfc0c71e5b0ffd0a85b78e37430b62257040714c2558298ce1fc058f4e918903f0d1747a4fef3f58e15722c35bd76d27492d9d08aa5b04e235bf43b22
          path: .yarn/plugins/@yarnpkg/plugin-catalogs.cjs
          spec: 'https://raw.githubusercontent.com/toss/yarn-plugin-catalogs/main/bundles/%40yarnpkg/plugin-catalogs.js'

      catalogs:
        list:
          react17:
            react: 17.0.0
    `;
    const testContent = npmUpdater.updateDependency({
      fileContent: yarnrcWYaml,
      upgrade,
    });
    expect(testContent).toEqual(codeBlock`
      nodeLinker: node-modules

      plugins:
        - checksum: 4cb9601cfc0c71e5b0ffd0a85b78e37430b62257040714c2558298ce1fc058f4e918903f0d1747a4fef3f58e15722c35bd76d27492d9d08aa5b04e235bf43b22
          path: .yarn/plugins/@yarnpkg/plugin-catalogs.cjs
          spec: 'https://raw.githubusercontent.com/toss/yarn-plugin-catalogs/main/bundles/%40yarnpkg/plugin-catalogs.js'

      catalogs:
        list:
          react17:
            react: 19.0.0
    `);
  });

  it('does nothing if the new and old values match', () => {
    const upgrade = {
      depType: 'yarn.catalog.default',
      depName: 'react',
      newValue: '19.0.0',
    };
    const yarnWorkspaceYaml = codeBlock`
      nodeLinker: node-modules

      plugins:
        - checksum: 4cb9601cfc0c71e5b0ffd0a85b78e37430b62257040714c2558298ce1fc058f4e918903f0d1747a4fef3f58e15722c35bd76d27492d9d08aa5b04e235bf43b22
          path: .yarn/plugins/@yarnpkg/plugin-catalogs.cjs
          spec: 'https://raw.githubusercontent.com/toss/yarn-plugin-catalogs/main/bundles/%40yarnpkg/plugin-catalogs.js'

      catalogs:
        list:
          react: 19.0.0
    `;
    const testContent = npmUpdater.updateDependency({
      fileContent: yarnWorkspaceYaml,
      upgrade,
    });
    expect(testContent).toEqual(yarnWorkspaceYaml);
  });

  it.skip('replaces package', () => {
    const upgrade = {
      depType: 'yarn.catalog.default',
      depName: 'config',
      newName: 'abc',
      newValue: '2.0.0',
    };
    const yarnWorkspaceYaml = codeBlock`
      packages:
        - pkg-a

      catalog:
        config: 1.21.0
    `;
    const testContent = npmUpdater.updateDependency({
      fileContent: yarnWorkspaceYaml,
      upgrade,
    });
    expect(testContent).toEqual(codeBlock`
      packages:
        - pkg-a

      catalog:
        abc: 2.0.0
    `);
  });

  it.skip('replaces a github dependency value', () => {
    const upgrade = {
      depType: 'yarn.catalog.default',
      depName: 'gulp',
      currentValue: 'v4.0.0-alpha.2',
      currentRawValue: 'gulpjs/gulp#v4.0.0-alpha.2',
      newValue: 'v4.0.0',
    };
    const yarnWorkspaceYaml = codeBlock`
      packages:
        - pkg-a

      catalog:
        gulp: gulpjs/gulp#v4.0.0-alpha.2
    `;
    const testContent = npmUpdater.updateDependency({
      fileContent: yarnWorkspaceYaml,
      upgrade,
    });
    expect(testContent).toEqual(codeBlock`
      packages:
        - pkg-a

      catalog:
        gulp: gulpjs/gulp#v4.0.0
    `);
  });

  it.skip('replaces a npm package alias', () => {
    const upgrade = {
      depType: 'yarn.catalog.default',
      depName: 'hapi',
      npmPackageAlias: true,
      packageName: '@hapi/hapi',
      currentValue: '18.3.0',
      newValue: '18.3.1',
    };
    const yarnWorkspaceYaml = codeBlock`
      packages:
        - pkg-a

      catalog:
        hapi: npm:@hapi/hapi@18.3.0
    `;
    const testContent = npmUpdater.updateDependency({
      fileContent: yarnWorkspaceYaml,
      upgrade,
    });
    expect(testContent).toEqual(codeBlock`
      packages:
        - pkg-a

      catalog:
        hapi: npm:@hapi/hapi@18.3.1
    `);
  });

  it.skip('replaces a github short hash', () => {
    const upgrade = {
      depType: 'yarn.catalog.default',
      depName: 'gulp',
      currentDigest: 'abcdef7',
      currentRawValue: 'gulpjs/gulp#abcdef7',
      newDigest: '0000000000111111111122222222223333333333',
    };
    const yarnWorkspaceYaml = codeBlock`
      packages:
        - pkg-a

      catalog:
        gulp: gulpjs/gulp#abcdef7
    `;
    const testContent = npmUpdater.updateDependency({
      fileContent: yarnWorkspaceYaml,
      upgrade,
    });
    expect(testContent).toEqual(codeBlock`
      packages:
        - pkg-a

      catalog:
        gulp: gulpjs/gulp#0000000
    `);
  });

  it.skip('replaces a github fully specified version', () => {
    const upgrade = {
      depType: 'yarn.catalog.default',
      depName: 'n',
      currentValue: 'v1.0.0',
      currentRawValue: 'git+https://github.com/owner/n#v1.0.0',
      newValue: 'v1.1.0',
    };
    const yarnWorkspaceYaml = codeBlock`
      packages:
        - pkg-a

      catalog:
        n: git+https://github.com/owner/n#v1.0.0
    `;
    const testContent = npmUpdater.updateDependency({
      fileContent: yarnWorkspaceYaml,
      upgrade,
    });
    expect(testContent).toEqual(codeBlock`
      packages:
        - pkg-a

      catalog:
        n: git+https://github.com/owner/n#v1.1.0
    `);
  });

  it.skip('returns null if the dependency is not present in the target catalog', () => {
    const upgrade = {
      depType: 'yarn.catalog.default',
      depName: 'react-not',
      newValue: '19.0.0',
    };
    const yarnWorkspaceYaml = codeBlock`
      packages:
        - pkg-a

      catalog:
        react: 18.3.1
    `;
    const testContent = npmUpdater.updateDependency({
      fileContent: yarnWorkspaceYaml,
      upgrade,
    });
    expect(testContent).toBeNull();
  });

  it.skip('returns null if catalogs are missing', () => {
    const upgrade = {
      depType: 'yarn.catalog.default',
      depName: 'react',
      newValue: '19.0.0',
    };
    const yarnWorkspaceYaml = codeBlock`
      packages:
        - pkg-a
    `;
    const testContent = npmUpdater.updateDependency({
      fileContent: yarnWorkspaceYaml,
      upgrade,
    });
    expect(testContent).toBeNull();
  });

  it.skip('returns null if empty file', () => {
    const upgrade = {
      depType: 'yarn.catalog.default',
      depName: 'react',
      newValue: '19.0.0',
    };
    const testContent = npmUpdater.updateDependency({
      fileContent: null as never,
      upgrade,
    });
    expect(testContent).toBeNull();
  });

  it.skip('preserves literal whitespace', () => {
    const upgrade = {
      depType: 'yarn.catalog.default',
      depName: 'react',
      newValue: '19.0.0',
    };
    const yarnWorkspaceYaml = codeBlock`
      packages:
        - pkg-a

      catalog:
        react:    18.3.1
    `;
    const testContent = npmUpdater.updateDependency({
      fileContent: yarnWorkspaceYaml,
      upgrade,
    });
    expect(testContent).toEqual(codeBlock`
      packages:
        - pkg-a

      catalog:
        react:    19.0.0
    `);
  });

  it.skip('preserves single quote style', () => {
    const upgrade = {
      depType: 'yarn.catalog.default',
      depName: 'react',
      newValue: '19.0.0',
    };
    const yarnWorkspaceYaml = codeBlock`
      packages:
        - pkg-a

      catalog:
        react: '18.3.1'
    `;
    const testContent = npmUpdater.updateDependency({
      fileContent: yarnWorkspaceYaml,
      upgrade,
    });
    expect(testContent).toEqual(codeBlock`
      packages:
        - pkg-a

      catalog:
        react: '19.0.0'
    `);
  });

  it.skip('preserves comments', () => {
    const upgrade = {
      depType: 'yarn.catalog.default',
      depName: 'react',
      newValue: '19.0.0',
    };
    const yarnWorkspaceYaml = codeBlock`
      packages:
        - pkg-a

      catalog:
        react: 18.3.1 # This is a comment
        # This is another comment
        react-dom: 18.3.1
    `;
    const testContent = npmUpdater.updateDependency({
      fileContent: yarnWorkspaceYaml,
      upgrade,
    });
    expect(testContent).toEqual(codeBlock`
      packages:
        - pkg-a

      catalog:
        react: 19.0.0 # This is a comment
        # This is another comment
        react-dom: 18.3.1
    `);
  });

  it.skip('preserves double quote style', () => {
    const upgrade = {
      depType: 'yarn.catalog.default',
      depName: 'react',
      newValue: '19.0.0',
    };
    const yarnWorkspaceYaml = codeBlock`
      packages:
        - pkg-a

      catalog:
        react: "18.3.1"
    `;
    const testContent = npmUpdater.updateDependency({
      fileContent: yarnWorkspaceYaml,
      upgrade,
    });
    expect(testContent).toEqual(codeBlock`
      packages:
        - pkg-a

      catalog:
        react: "19.0.0"
    `);
  });

  it.skip('preserves anchors, replacing only the value', () => {
    // At the time of writing, this pattern is the recommended way to sync
    // dependencies in catalogs.
    // @see https://github.com/yarn/yarn/issues/8245#issuecomment-2371335323
    const upgrade = {
      depType: 'yarn.catalog.default',
      depName: 'react',
      newValue: '19.0.0',
    };
    const yarnWorkspaceYaml = codeBlock`
      packages:
        - pkg-a

      catalog:
        react: &react 18.3.1
        react-dom: *react
    `;
    const testContent = npmUpdater.updateDependency({
      fileContent: yarnWorkspaceYaml,
      upgrade,
    });
    expect(testContent).toEqual(codeBlock`
      packages:
        - pkg-a

      catalog:
        react: &react 19.0.0
        react-dom: *react
    `);
  });

  it.skip('preserves whitespace with anchors', () => {
    const upgrade = {
      depType: 'yarn.catalog.default',
      depName: 'react',
      newValue: '19.0.0',
    };
    const yarnWorkspaceYaml = codeBlock`
      packages:
        - pkg-a

      catalog:
        react: &react    18.3.1
    `;
    const testContent = npmUpdater.updateDependency({
      fileContent: yarnWorkspaceYaml,
      upgrade,
    });
    expect(testContent).toEqual(codeBlock`
      packages:
        - pkg-a

      catalog:
        react: &react    19.0.0
    `);
  });

  it.skip('preserves quotation style with anchors', () => {
    const upgrade = {
      depType: 'yarn.catalog.default',
      depName: 'react',
      newValue: '19.0.0',
    };
    const yarnWorkspaceYaml = codeBlock`
      packages:
        - pkg-a

      catalog:
        react: &react "18.3.1"
    `;
    const testContent = npmUpdater.updateDependency({
      fileContent: yarnWorkspaceYaml,
      upgrade,
    });
    expect(testContent).toEqual(codeBlock`
      packages:
        - pkg-a

      catalog:
        react: &react "19.0.0"
    `);
  });

  it.skip('preserves formatting in flow style syntax', () => {
    const upgrade = {
      depType: 'yarn.catalog.default',
      depName: 'react',
      newValue: '19.0.0',
    };
    const yarnWorkspaceYaml = codeBlock`
      packages:
        - pkg-a

      catalog: {
        # This is a comment
        "react": "18.3.1"
      }
    `;
    const testContent = npmUpdater.updateDependency({
      fileContent: yarnWorkspaceYaml,
      upgrade,
    });
    expect(testContent).toEqual(codeBlock`
      packages:
        - pkg-a

      catalog: {
        # This is a comment
        "react": "19.0.0"
      }
    `);
  });

  it.skip('does not replace aliases in the value position', () => {
    const upgrade = {
      depType: 'yarn.catalog.default',
      depName: 'react',
      newValue: '19.0.0',
    };
    // In the general case, we do not know whether we should replace the anchor
    // that an alias is resolved from. We leave this up to the user, e.g. via a
    // Regex custom manager.
    const yarnWorkspaceYaml = codeBlock`
      __deps:
        react: &react 18.3.1

      packages:
        - pkg-a

      catalog:
        react: *react
        react-dom: *react
    `;
    const testContent = npmUpdater.updateDependency({
      fileContent: yarnWorkspaceYaml,
      upgrade,
    });
    expect(testContent).toBeNull();
  });

  it.skip('does not replace aliases in the key position', () => {
    const upgrade = {
      depType: 'yarn.catalog.default',
      depName: 'react',
      newName: 'react-x',
    };
    const yarnWorkspaceYaml = codeBlock`
      __vars:
        &r react: ""

      packages:
        - pkg-a

      catalog:
        *r: 18.0.0
    `;
    const testContent = npmUpdater.updateDependency({
      fileContent: yarnWorkspaceYaml,
      upgrade,
    });
    expect(testContent).toBeNull();
  });
});
