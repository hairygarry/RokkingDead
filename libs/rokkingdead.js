var main;
(function (main) {
    var User = (function () {
        function User(name) {
            this.name = name;
        }
        return User;
    }());
    main.User = User;
})(main || (main = {}));
