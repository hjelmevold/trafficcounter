var nodeLib = require('/lib/xp/node');
var encodingLib = require('/lib/text-encoding');

var repo = nodeLib.connect({
    repoId: app.name,
    branch: 'master',
    principals: ['role:system.admin']
});

exports.filter = function (request, next) {
    var p = request.path;
    var ua = request.headers['User-Agent'] || '';

    if (request.mode === 'live' && request.method === 'GET') {

        // Filter out paths starting with the specified strings
        if (p.indexOf('/_/') !== 0 && p.indexOf('/robots.txt') !== 0 && p.indexOf('/apple-touch-icon') !== 0 && p.indexOf('/favicon.ico') !== 0) {

            // Filter out unwanted User Agents
            if (ua.indexOf('UptimeRobot') < 0 && ua.indexOf('facebookexternalhit') < 0 && ua.indexOf('AdsBot-Google') < 0 && ua.indexOf('Googlebot') < 0 && ua.indexOf('Applebot') < 0) {

                // Store encrypted IP address as a node in the repo
                try {
                    repo.create({
                        /*
                            Hard-coded encryption key is not intended for later decryption, it's only used here to obfuscate remote IP address
                            The encryption key can be changed, but if deployed on exisisting data then new duplicates of existing encrypted IP addresses will no longer match
                            In those cases, make sure to delete the old repo before redeploying the app to ensure that all new data is consistent
                         */
                        displayName: encodingLib.hmacSha1AsHex(request.remoteAddress, encodingLib.hexEncode('vHK]#8V.{-Mw$.$5|7jy=(9%Y~6_24D')),
                        contextPath: request.contextPath // allows data to be grouped by site
                        /*
                            Timestamp could be logged here as a property, but this is already logged as index metadata on the node (the '_ts' property)
                            The advantage of using the _ts metadata instead of as a dedicated property is speed most of all, and second of all to avoid storing redundant info
                            The disadvantage of not logging this as a dedicated property is that metadata technically belongs to the index, not to the content
                            Therefore, if the node is modified, a new _ts value is automatically assigned with the current dateTime, and there is no way to undo this
                            Example: if restoring data from a dump, all nodes get new timestamps with the current dateTime
                         */
                    });
                } catch(e) {
                    log.error('Could not create node in repo "' + app.name + '"', e);
                }
            }
        }
    }

    return next(request);
};
