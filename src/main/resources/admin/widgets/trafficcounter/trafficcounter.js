var contentLib = require('/lib/xp/content');
var portalLib = require('/lib/xp/portal');
var thymeleaf = require('/lib/thymeleaf');
var nodeLib = require('/lib/xp/node');
var authLib = require('/lib/xp/auth');
var util = require('/lib/util/data');
var moment = require('/lib/moment.min.js');

var view = resolve('trafficcounter.html');
var daysToRetrieve = 14;

var repo = nodeLib.connect({
    repoId: app.name,
    branch: 'master',
    principals: ['role:system.admin']
});

function verifyUserWritePermissionsByPath(path) {
    var userHasWritePermissions = false;

    var contentPermissions = contentLib.getPermissions({
        key: path
    });

    var principalsWhoMayWrite = util.forceArray(contentPermissions.permissions).map(function (permission) {
        if (permission.allow.indexOf('WRITE_PERMISSIONS') >= 0 || permission.deny.indexOf('WRITE_PERMISSIONS') < 0) {
            return permission.principal;
        }
    });

    principalsWhoMayWrite.forEach(function (principal) {
        if (principal.startsWith('role:')) {
            var role = principal.substring(5);
            if (authLib.hasRole(role)) {
                userHasWritePermissions = true;
            }
        }
    });

    return userHasWritePermissions;
}

function handleGet(req) {
    var contentId = req.params.contentId;

    if (!contentId && portalLib.getContent()) {
        contentId = portalLib.getContent()._id;
    }

    if (!contentId) {
        return {
            contentType: 'text/html',
            body: '<widget class="error">No content selected.</widget>'
        };
    }

    var content = contentLib.get({
        key: contentId,
        branch: 'draft'
    });
    // This is typically the site path
    var rootContentPath = content._path.match(/^\/[^\/]*/)[0];

    var userHasWritePermissions = verifyUserWritePermissionsByPath(rootContentPath);
    if (!userHasWritePermissions) {
        return {
            contentType: 'text/html',
            body: '<widget class="error">Permission denied.</widget>'
        };
    }

    var datesToRetrieve = [];
    var today = moment().format('YYYY-MM-DD');
    for (var i = 0; i < daysToRetrieve; i++) {
        // Insert dates into array, ascending
        datesToRetrieve.unshift(moment(today).subtract(i, 'days').format('YYYY-MM-DD'));
    };

    var hitsPerDate = [];
    datesToRetrieve.forEach(function (date) {
        var nodesForDate = repo.query({
            // Get nodes that match selected site and the date in this iteration
            query: 'contextPath = "/site/master' + rootContentPath + '" AND _ts LIKE "' + date + '*"',
            count: 0, // not interested in the nodes themselves, just the aggregations
            aggregations: {
                uniqueHits: {
                    terms: {
                        field: 'displayName',
                        size: 65536 // maximum number of unique hits pr. day to report
                    }
                }
            }
        });
        if (nodesForDate.aggregations.uniqueHits.buckets.length) {
            hitsPerDate.push({
                date: date,
                unique: nodesForDate.aggregations.uniqueHits.buckets.length,
                total: nodesForDate.total
            })
        }
    });

    if (!hitsPerDate.length) {
        return {
            contentType: 'text/html',
            body: '<widget>No data.</widget>'
        };
    }

    var model = {
        hitsPerDate: hitsPerDate
    };

    return {
        contentType: 'text/html',
        body: thymeleaf.render(view, model)
    };
}

exports.get = handleGet;
