import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('frontend dependencies', () => {
    it('does not import backend-only Arrow packages from frontend source', () => {
        const forbiddenPackage = ['apache', 'arrow'].join('-');
        const sourceFiles = listTypeScriptFiles(join(process.cwd(), 'src'))
            .filter((file) => !file.endsWith('frontendDependency.test.ts'));

        const importsArrow = sourceFiles.some((file) =>
            readFileSync(file, 'utf8').includes(`from '${forbiddenPackage}'`) ||
            readFileSync(file, 'utf8').includes(`from "${forbiddenPackage}"`),
        );

        expect(importsArrow).toBe(false);
    });
});

function listTypeScriptFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return listTypeScriptFiles(path);
        return entry.isFile() && path.endsWith('.ts') ? [path] : [];
    });
}
