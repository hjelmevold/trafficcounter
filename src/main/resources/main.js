var clusterLib = require('/lib/xp/cluster');
var nodeLib = require('/lib/xp/node');
var cron = require('/lib/cron');
var appersistLib = require('/lib/openxp/appersist');
var moment = require('/lib/moment.min.js');

var daysUntilExpiration = 14;

// Since the cron job within isn't resource-intensive, we can get away with using isMaster() as a way to ensure that the code is only run once in the cluster
// When distributable tasks are implemented in a later version of XP, please use the proper function for this check instead of isMaster()
if (clusterLib.isMaster()) {
    // Initialize app repo if it doesn't already exist
    appersistLib.repository.getConnection();

    /*
        Vacuum expired data
     */
    cron.schedule({
        name: 'TrafficCounter nightly vacuum',
        cron: '42 2 * * *', // every night at 02:42
        callback: function () {
            log.info('Vacuuming expired traffic data…');

            var repo = nodeLib.connect({
                repoId: app.name,
                branch: 'master',
                principals: ['role:system.admin']
            });

            var expirationDate = moment().subtract(daysUntilExpiration, 'days').format('YYYY-MM-DD');
            var remainingExpiredNodes = -1;
            var batchSize = 1000; // Query hits occupy ~50KB memory and every full batch deletion takes ~5s

            do {
                var expiredNodesBatch = repo.query({
                    // Ignore root node, but otherwise all remaining expired nodes
                    query: '_ts < instant("' + expirationDate + 'T00:00:00.000Z") AND _path != "/"',
                    count: batchSize
                });

                var nodeIdsToDelete = [];
                if (expiredNodesBatch.hits.length) {
                    nodeIdsToDelete = expiredNodesBatch.hits.map(function (hit) {
                        return hit.id;
                    });

                    try {
                        repo.delete(nodeIdsToDelete);
                    } catch (e) {
                        // Break out of infinite loop in case a node cannot be deleted
                        break;
                    }
                }

                // Keep track of amount remaining to delete, or else infinite loop!
                remainingExpiredNodes = expiredNodesBatch.total - expiredNodesBatch.count;

            } while (remainingExpiredNodes > 0);

            log.info('Vacuuming expired traffic data… DONE');
        },
        context: {
            repository: app.name,
            branch: 'master',
            principals: ['role:system.admin'],
            user: {
                login: 'su',
                userStore: 'system'
            }
        }
    });
}
