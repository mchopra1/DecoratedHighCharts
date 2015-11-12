angular.module('Example', ['decorated-high-charts']).controller("MainCtrl", function ($scope, $http) {

    /**
     * security related behavior
     */
    $scope.states = {
        ready: false
    };

    $scope.chartProperties = {
        regression: "logarithmic",
        regression_degree: 3,
        type: "Scattered Plot",
        x_attribute: {
            colTag: "wal_to_worst",
            text: "WAL"
        },
        y_attribute: {
            colTag: "oas",
            text: "OAS"
        }
    };

    $scope.chartOptions = {
        disableExporting: true,
        disableChartType: true,
        disableMoreOptions: true,
        disableFirstProperty: true,
        alwaysEnableLegend: true
    };

    $http.get("columnDefs.json").then(function(data){
        $scope.numericalColumns = _.where(data.data, {format: "NUMERICAL"});
        $scope.categoricalColumns = _.where(data.data, {format: "CATEGORICAL"});
    }, function(){
        $scope.numericalColumns = [  {
            "colTag": "oas",
            "text": "OAS",
            "aggregationMethod": "AVERAGE",
            "visualizationTypes": [
                "BOX_PLOT",
                "SCATTERED_PLOT",
                "COLUMN_CHART"
            ]
        },{
            colTag: "wal_to_worst",
            text: "WAL",
            "aggregationMethod": "AVERAGE",
            "visualizationTypes": [
                "BOX_PLOT",
                "SCATTERED_PLOT",
                "COLUMN_CHART"
            ]
        },{
            colTag: "ytw",
            text: "YTW",
            "aggregationMethod": "AVERAGE",
            "visualizationTypes": [
                "BOX_PLOT",
                "SCATTERED_PLOT",
                "COLUMN_CHART"
            ]
        },{
            "colTag": "amt_issued",
            "text": "Amt Issued",
            "aggregationMethod": "SUM",
            "visualizationTypes": [
                "PIE_CHART",
                "BOX_PLOT",
                "SCATTERED_PLOT",
                "COLUMN_CHART"
            ]
        }];

        $scope.categoricalColumns = [{
            colTag: "issuer_sname",
            text: "Issuer Name",
            "visualizationTypes": [
                "BOX_PLOT",
                "SCATTERED_PLOT",
                "PIE_CHART",
                "COLUMN_CHART"
            ]
        },{
            colTag: "barclay_sector4",
            text: "Barclays Sub-Industry",
            "visualizationTypes": [
                "BOX_PLOT",
                "SCATTERED_PLOT",
                "PIE_CHART",
                "COLUMN_CHART"
            ]
        }];
    });

    //$scope.customButtons = [{
    //    callback: function(){
    //        console.log("custom callback fired!");
    //    },
    //    faClass: "fa-remove"
    //}];

    $scope.beforeRender = function(){
        console.log("before render called!");
    };

    $scope.afterRender = function(){
        console.log("after render called!");
    };

    $scope.clickCallback = function(point){
        console.log(point);
        return true;
    };

    $scope.getSelectedRowsData = function(){
        return _.filter($scope.data, function(datum){
            return ["00206RCD2","B0A01QJZ2"].indexOf(datum.cusip) > -1;
        });
    };

    $scope.changeTitle = function(){
        $scope.apiHandle.api.changeAxisTitle('y', 'hey');
    };

    $scope.addSeries = function(){
        $scope.seriesAdded = $scope.apiHandle.api.addAdHocSeries({
            id: _.uniqueId("ser"),
            data: [{
                x: 50,
                y: 50,
                id: "abdd"
            }, {
                x: 100,
                y: 100,
                id: "abd"
            }]
        });
    };

    $scope.removeSeries = function(){
        $scope.apiHandle.api.removeAllAdHocSeries($scope.seriesAdded.options.id);
    };

    $scope.apiHandle = {};

    $http.get("mock_data.json").then(function(data){
        $scope.data = data.data;
        $scope.states.ready = true;
    });
});