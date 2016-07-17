var gulp = require('gulp');
var git = require('gulp-git');

gulp.task('status', function () {
    git.status({}, function (err, stdout) {
        if (err) throw err;
    });
});

gulp.task('default',['status']);