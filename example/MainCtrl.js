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
            "Box Plot",
            "Scattered Plot",
            "Column Chart"
        ]
    },{
        colTag: "wal_to_worst",
        text: "WAL",
        "aggregationMethod": "AVERAGE",
        "visualizationTypes": [
            "Box Plot",
            "Scattered Plot",
            "Column Chart"
        ]
    },{
        colTag: "ytw",
        text: "YTW",
        "aggregationMethod": "AVERAGE",
        "visualizationTypes": [
            "Box Plot",
            "Scattered Plot",
            "Column Chart"
        ]
    },{
        "colTag": "amt_issued",
        "text": "Amt Issued",
        "aggregationMethod": "SUM",
        "visualizationTypes": [
            "Pie Chart",
            "Box Plot",
            "Scattered Plot",
            "Column Chart"
        ]
    }];

    $scope.categoricalColumns = [{
        colTag: "issuer_sname",
        text: "Issuer Name",
        "visualizationTypes": [
            "Box Plot",
            "Scattered Plot",
            "Pie Chart",
            "Column Chart"
        ]
    },{
        colTag: "barclay_sector4",
        text: "Barclays Sub-Industry",
        "visualizationTypes": [
            "Box Plot",
            "Scattered Plot",
            "Pie Chart",
            "Column Chart"
        ]
    }];

    $scope.customButtons = [{
        callback: function(){
            console.log("custom callback fired!");
        },
        faClass: "fa-remove"
    }];

    $scope.apiHandle = {};

    $http.get("mock_data.json").then(function(data){
        $scope.data = data.data;
        $scope.states.ready = true;
    });
});