angular.module('Example', ['decorated-high-charts']).controller("MainCtrl", function ($scope, $http) {

    /**
     * security related behavior
     */
    $scope.states = {
        ready: false
    };

    $scope.chartProperties = {
        filterMore: "all",
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

    $scope.customButtons = [{
        callback: function(){
            console.log("custom callback fired!");
        },
        faClass: "fa-remove"
    }];

    $scope.clickCallback = function(point){
        console.log(point);
        return true;
    };

    $scope.getSelectedRowsData = function(){
        return _.filter($scope.data, function(datum){
            return ["00206RCD2","B0A01QJZ2"].indexOf(datum.cusip) > -1;
        });
    };

    $scope.apiHandle = {};

    $http.get("mock_data.json").then(function(data){
        $scope.data = data.data;
        $scope.states.ready = true;
    });
});