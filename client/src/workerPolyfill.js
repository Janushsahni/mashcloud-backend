// Polyfill global require for UMD/CommonJS modules inside Web Worker context
if (typeof self !== 'undefined') {
    if (typeof self.require === 'undefined') {
        self.require = function(moduleName) {
            if (moduleName === 'fs') {
                return {
                    readFileSync: () => new Uint8Array()
                };
            }
            return {};
        };
    }
    // Also polyfill window to self in case any library references window in worker
    if (typeof self.window === 'undefined') {
        self.window = self;
    }
}
