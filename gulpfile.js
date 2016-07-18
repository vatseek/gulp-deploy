'use strict';
var _ = require('underscore');
var gulp = require('gulp');
var git = require('gulp-git');
var Client = require('ftp');
var fs = require('fs');
var async = require('async');
const path = require('path');

const options = {
    host: '127.0.0.0',
    port: 21,
    user: 'admin',
    password: '',
    working_dir: '/web/test',
};

function getCurrentVersion(out) {
    const result = out.split("\n");
    if (!_.isArray(result) || !result) {
        throw 'invalid response';
    }
    const hash = result[0].replace('commit ', '');
    if (!hash.match(/^[a-f0-9]{40}$/)) {
        throw 'invalid hash';
    }
    return hash;
}

function readFile() {
    fs.readFile('version', 'utf8', function (err, data) {
        if (err) {
            return console.log(err);
        }
        console.log(data);
    });
}

function getDiff(version, callback) {
    git.exec({args: 'diff --name-status ' + version}, function (err, stdout) {
        if (err) {
            return callback(err, '')
        }
        callback(null, stdout);
    });
}

function createDir(c, file, callback) {
    const data = path.parse(file)
    c.mkdir(data.dir, true, function(err, result) {
        if (err) return callback(err);
    });
}

function getVersion(back) {
    var c = new Client();
    c.on('ready', function () {
        async.waterfall([
            function(callback) {
                c.cwd(options.working_dir, function(err, result) {
                    callback(err, result)
                });
            },
            function (data, callback) {
                c.get('version', function (err, stream) {
                    if (err) {
                        return callback(err, '');
                    }
                    let string = '';
                    stream.on('data', function (chunk) {
                        if (chunk) {
                            string += chunk;
                        }
                    });
                    stream.on('end', function () {
                        callback(err, string);
                    });
                });
            }
        ], function asyncComplete(err, data) {
            back(err, data);
            c.end();
        });
    });
    c.connect(options);
}

gulp.task('main', function () {
    async.waterfall([
        function(callback) {
            try {
                getVersion(callback);
            } catch (err) {
                callback(err, '')
            }
        }, function(version, callback) {
            getDiff(version, callback);
        }, function(filesList, callback) {
            let files = filesList.trim().split("\n");
            let deleted = [],
                modified = [];
            _.map(files, x => {
                const file = x.split('\t');
                if (_.isArray(file) && file.length == 2) {
                    if (file[0] == 'D') {
                        deleted.push(file[1]);
                    } else {
                        modified.push(file[1]);
                    }
                }
            });

            callback(null, [deleted, modified]);
        }, function(files, callback) {
            console.log('Copy files', files[1]);
            var c = new Client();
            c.on('ready', function () {
                _.each(files[1], (file) => {
                    const target = file;
                    const dest = `${options.working_dir}/${target}`;
                    console.log(`- ${target}`);
                    c.put(target, dest, function(err) {
                        if (err && err.code == 553) { // No file or directory
                            createDir(c, dest, callback);
                            c.put(target, dest, function(err) {
                                if (err) return callback(err);
                            });
                        }
                    });
                });
                callback(null, 'finish');
                c.end();
            });
            c.connect(options);
        }
    ], function asyncComplete(err, data) {
        console.log(data);
        if (err) {
            console.warn('Error updating stock ticker JSON.',err);
        }
    })
});

gulp.task('status', function () {
    git.status({}, function (err, stdout) {
        if (err) throw err;
    });
});


gulp.task('diff', function () {
    git.exec({args: 'diff --name-status '}, function (err, stdout) {
        console.log(stdout);
        if (err) throw err;
    });
});

gulp.task('log', function () {
    git.exec({args: 'log -1'}, function (err, stdout) {
        getCurrentVersion(stdout);
        if (err) throw err;
    });
});


gulp.task('default', ['main']);