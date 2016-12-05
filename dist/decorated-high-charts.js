    if (typeof String.prototype.endsWith !== 'function') {
        String.prototype.endsWith = function (suffix) {
            return this.indexOf(suffix, this.length - suffix.length) !== -1;
        };
    }

    Date.prototype.getYYYYMMDD = function () {
        var month = this.getMonth() + 1;
        month = month.toString().length == 1 ? "0" + month : month;
        var day = this.getDate();
        day = day.toString().length == 1 ? "0" + day : day;
        return this.getFullYear() + "-" + month + "-" + day;
    };

    const $script = $("script[src]");
    const src = $script[$script.length - 1].src;
    const scriptFolder = src.substr(0, src.lastIndexOf("/") + 1);
    angular.module("decorated-high-charts", ['ui.bootstrap', 'typeahead-focus']);
    angular.module("decorated-high-charts")
        .directive("decoratedHighCharts", function (chartFactory, $timeout) {
            return {
                restrict: "E",
                scope: {
                    /**
                     * Core properties object
                     */
                    chartProperties: "=",
                    /**
                     * Array of data objects
                     */
                    data: '=',
                    /**
                     * Primary key for data objects
                     */
                    key: '@',
                    /**
                     * Array of column objects which define attributes which are numerical in nature
                     */
                    numericalColumns: "=",
                    /**
                     * Array of column objects which define attributes which are categorical in nature
                     */
                    categoricalColumns: '=',
                    /**
                     * This is an optional array of objects which can be passed in to define custom button icons and
                     * callbacks which will appear at the top right of the panel
                     */
                    customButtons: "=?",
                    /**
                     * Optional callback which is triggered right before the chart is rendered or updated
                     */
                    beforeRender: "&?",
                    /**
                     * Optional callback which is triggered right after the chart is rendered or updated
                     */
                    afterRender: "&?",
                    /**
                     * Called if a series is removed via a legend right click
                     */
                    removeSeriesCallback: "&?",
                    /**
                     * Called if a point is removed via the flexible remove button (in chart area)
                     */
                    pointRemovalCallback: "&?",
                    /**
                     * Callback for resetting the excluded points.  If true is returned, the chart does not reload
                     */
                    resetExcludedPointsCallback: "&?",
                    /**
                     * An object so outside resources can communicate with the chart if they wish
                     */
                    apiHandle: '=',
                    /**
                     * Callback which should return the rows which are selected from the data
                     */
                    getSelectedRowsData: "&?",
                    /**
                     * A boolean which defines if data should only be from the selected rows
                     */
                    showOnlySelectedRows: "=?",
                    /**
                     * Callback to call if a point on a scatterplot is clicked
                     */
                    scatterPlotPointClickCallback: "&?",
                    /**
                     * Optional non-binding title for the chart
                     */
                    chartTitle: "@?",
                    /**
                     * Additional HighCharts options to layer on defaults
                     */
                    chartOptions: "=?"
                },
                controller: function($scope, $element){
                    $scope.chartOptions = $scope.chartOptions || {};
                    $scope.chartProperties.dataToShow = $scope.chartProperties.dataToShow ? $scope.chartProperties.dataToShow : "all";
                    // Map colTags to actual objects as the dropdowns map by reference not by value
                    _.each(chartFactory.getRelevantProperties($scope.chartProperties), function(property){
                        $scope.chartProperties[property] = $scope.chartProperties[property] ?
                            _.findWhere($scope.numericalColumns.concat($scope.categoricalColumns),
                                {colTag: $scope.chartProperties[property].colTag}) :
                            undefined;
                    });
                    $scope.chartId = _.uniqueId('decorated-highchart-');
                    $scope.$flexibleRemoveBtn = $('<i class="fa fa-remove clickable"></i>').css({
                        'position': 'absolute',
                        'z-index': 0.99,
                        'color': 'red'
                    });
                },
                link: function (scope, elem, attrs) {
                    scope.chartFactory = chartFactory;
                    scope.alerts = {
                        generalWarning: {active: false, message: ""}
                    };
                    scope.states = {
                        menuDisplays: {
                            moreOptions: false,
                            changeChartType: false
                        },
                        needAttrs: false,
                        adHocSeriesOptions: []
                    };

                    // disable default right-click triggered context menu
                    elem.bind('contextmenu', function () {
                        return false;
                    });

                    /**
                     * create a reusable context menu to be displayed
                     * at the user's discretion
                     */
                    scope.$ctxMenu = dhc.buildContextMenuContainer(elem);

                    scope.toggleSlide = function (show, className) {
                        const camelCaseName = attrs.$normalize(className);
                        scope.states.menuDisplays[camelCaseName] = show;
                        var $ctrl = elem.find("." + className);
                        if (show) {
                            $ctrl.slideDown(500);
                            $ctrl.find("input").first().select();
                        }
                        else
                            $ctrl.slideUp(500);
                        // Since we are using some jQuery, after the end of $timeout a $apply is fired implicitly
                        $timeout(function () {});
                    };

                    scope.allPanelHidden = function(){
                        return scope.chartOptions.disableExporting && scope.chartOptions.disableChartType &&
                               scope.chartOptions.disableMoreOptions && scope.chartOptions.disablePropertyChooser;
                    };

                    scope.getRegressionText = function(){
                        return scope.chartProperties.regression ?
                            _.findWhere(chartFactory.regressionTypes, {tag: scope.chartProperties.regression}).text :
                            "No Regression";
                    };

                    /**
                     * Given an array of column objects, return the columns which are allowed for this chart type
                     * @param columnSet
                     * @returns {*}
                     */
                    scope.getValidColumns = function(columnSet){
                        return _.filter(columnSet, function(column){
                            return getVisualizationTypes(column).indexOf(scope.chartProperties.type.toUpperCase()) > -1;
                        });
                    };

                    /**
                     * When we change the chart type, some attributes may not be allowed for a new chart type. Let's
                     * check.
                     */
                    scope.changeChartType = function(){
                        const categoricalColumns = ["group_by"];
                        $timeout(function(){
                            _.each(scope.apiHandle.api.getRelevantProperties(), function(prop){
                                if( categoricalColumns.indexOf(prop) > -1  ){
                                    if( scope.getValidColumns(scope.categoricalColumns).indexOf(scope.chartProperties[prop]) == -1 ){
                                        delete scope.chartProperties[prop];
                                    }
                                }
                                else{
                                    if( scope.getValidColumns(scope.numericalColumns).indexOf(scope.chartProperties[prop]) == -1 ){
                                        delete scope.chartProperties[prop];
                                    }
                                }
                            });
                            scope.apiHandle.api.timeoutLoadChart();
                        });
                    };

                    /**
                     * turn each series's data into a HTML table
                     * and then export this table to Excel
                     */
                    scope.exportXLS = function () {
                        var html = dhc.chartToHTML(scope.states.chart);
                        if (window.navigator.msSaveBlob)
                            window.navigator.msSaveBlob(new Blob([html]), "time-series-export.xls");
                        else
                            saveAs(new Blob([html],{type: 'data:application/vnd.ms-excel;charset=utf-8'}),'time-series-export.xls');
                            // window.open('data:application/vnd.ms-excel,' + encodeURIComponent(html));
                    };

                    scope.exportPDF = function(){
                        scope.states.chart.exportChart({
                            type: 'application/pdf',
                            filename: 'chart-export ' + scope.states.chart.title.textStr
                        });
                    };

                    scope.removeSeries = function(series){
                        if( series ) {
                            const id = series.id || series.options.id;
                            series.remove();
                            scope.removeSeriesCallback({series: id});
                        }
                    };

                    scope.apiHandle.api = {
                        excludedPoints: [],
                        loadChart: function(){
                            // Tell user to fill in missing properties
                            if( _.map(chartFactory.getRequiredProperties(scope.chartProperties), function(prop){
                                    return scope.chartProperties[prop]
                                }).indexOf(undefined) > -1 ) {
                                scope.states.needAttrs = true;
                                if( !scope.states.chart ){
                                    scope.states.chart = createHighchart({
                                        chart: {
                                            renderTo: scope.chartId
                                        },
                                        exporting: {
                                            enabled: false,
                                            url: 'https://export.highcharts.com/'
                                        },
                                        title: {
                                            text: ""
                                        },
                                        data: []
                                    });
                                }
                                return;
                            }
                            scope.beforeRender();
                            scope.states.needAttrs = false;
                            var opts = chartFactory.getHighchartOptions(scope);
                            opts.chart.renderTo = scope.chartId;
                            scope.states.chart = createHighchart(opts);
                            if( scope.chartTitle )
                                scope.states.chart.setTitle({text: scope.chartTitle});
                            // Select all selected points on chart
                            _.each(scope.getSelectedRowsData(), function(datum){
                                scope.apiHandle.api.togglePoint(datum[scope.key], true);
                            });
                            scope.afterRender();
                        },
                        addAdHocSeries: function(seriesOptions){
                            var ser = scope.states.chart.addSeries(seriesOptions);
                            var foundIndex = _.findIndex(scope.states.adHocSeriesOptions,{id: seriesOptions.id});
                            if ( ser && foundIndex > -1 )
                                scope.states.adHocSeriesOptions[foundIndex] = angular.copy(seriesOptions);
                            else if ( ser )
                                scope.states.adHocSeriesOptions.push(angular.copy(seriesOptions));

                            if( ser )
                                dhc.attachLegendEventHandlers(ser, scope);
                            return ser;
                        },
                        removeAdHocSeries: function(seriesId){
                            var series = scope.states.chart.get(seriesId);
                            const index = _.findIndex(scope.states.adHocSeriesOptions, function(opt){
                                if( series )
                                    return series.options.id === opt.id;
                            });
                            if( index > -1 )
                                scope.states.adHocSeriesOptions.splice(index,1);
                            if( series )
                                series.remove();
                            return !!series;
                        },
                        removeAllAdHocSeries: function(){
                            const ids = _.pluck(scope.states.adHocSeriesOptions, "id");
                            _.each(ids, function(id){
                                scope.apiHandle.api.removeAdHocSeries(id);
                            });
                            scope.states.adHocSeriesOptions = [];
                        },
                        timeoutLoadChart: function(){
                            $timeout(function(){
                                scope.apiHandle.api.loadChart();
                            });
                        },
                        changeChartTitle: function(title){
                            scope.states.chart.setTitle({text: title});
                        },
                        changeAxisTitle: function(axis, title){
                            if( axis == 'x')
                                scope.states.chart.xAxis[0].setTitle({text: title});
                            else if( axis == 'y')
                                scope.states.chart.yAxis[0].setTitle({text: title});
                        },
                        togglePoint: function(key, skipLoad){
                            const point = scope.states.chart.get(key);
                            if( point )
                                point.select(null, true);
                            if( !skipLoad && scope.chartProperties.dataToShow === 'selected' )
                                scope.apiHandle.api.loadChart();
                        },
                        getPointStatus: function(key){
                            const point = scope.states.chart.get(key);
                            return point ? point.selected : point;
                        },
                        getRelevantProperties: function(){
                            return chartFactory.getRelevantProperties(scope.chartProperties);
                        },
                        resetExcludedPoints: function(){
                            this.excludedPoints = [];
                            if( !scope.resetExcludedPointsCallback() )
                                this.loadChart();
                        },
                        changeRegressionType : function(tag){
                            scope.chartProperties.regression = tag;
                            this.loadChart();
                        },
                        /**
                         * Sets size to be exactly the dimensions of the container
                         */
                        hardReflow: function(){
                            var containerStyles = window.getComputedStyle(scope.states.chart.container);
                            scope.states.chart.setSize(parseInt(containerStyles.width), parseInt(containerStyles.height));
                        }
                    };

                    /**
                     * This function returns visualization types which are cased correctly and underscores
                     * replaced with spaces for legacy reasons
                     * @param column
                     * @returns {*}
                     */
                    function getVisualizationTypes(column){
                        return _.map(column.visualizationTypes, function(type){
                            return type.replace("_"," ").toUpperCase();
                        });
                    }

                    function createHighchart(opts){
                        return new Highcharts.Chart(opts,function(chart){});
                    }

                    /**
                     * initialization & initial rendering
                     */
                    $timeout(function () {
                        scope.apiHandle.api.loadChart();
                        // Initialize dom element variable
                        scope.highchartDOMElem = $($('#' + scope.chartId).get()[0]);
                        $(scope.highchartDOMElem).hover(null, function () {
                            scope.$flexibleRemoveBtn.detach();
                        });
                    });

                    // This is to remove any unexpected propagation from dropdowns
                    //elem.find(".floating-form").click(function (e) {
                    //    e.stopPropagation();
                    //});
                },
                templateUrl: scriptFolder.endsWith("src/") ? scriptFolder + "/templates/DecoratedHighCharts.html" : "DecoratedHighCharts.html"
            };
        })
        .directive("dhcClickOutside", function () {
            return {
                restrict: "A",
                scope: {
                    openState: '=dhcOpenState',
                    closeCallback: '&dhcCloseCallback'
                },
                link: function (scope, element) {
                    /**
                     * We use a state variable for clicking outside the element because if we use stopPropagation()
                     * we possibly stop other legitimate events from triggering.
                     */
                    var clickedOutside = true;

                    const documentClickHandler = function () {
                        if (clickedOutside && scope.openState)
                            scope.closeCallback();
                        clickedOutside = true;
                    };
                    $(document).click(documentClickHandler);

                    const elementClickHandler = function () {
                        clickedOutside = false;
                    };
                    element.click(elementClickHandler);

                    // Unbind click listeners when element is removed
                    scope.$on('$destroy', function () {
                        $(document).unbind("click", documentClickHandler);
                        element.unbind("click", elementClickHandler);
                    });
                }
            }
        });

/**
 * 'chartProperties' refer to attributes of the chart model that the application interact with
 * such as whether the chart groups by Industry or Sec Type etc ...
 * 'chartOptions' refer to literally to highcharts constructor options
 */

var TURBO_THRESHOLD = 2000;

angular.module('decorated-high-charts').factory('chartFactory', function (boxPlotProvider, scatteredChartProvider, pieChartProvider, columnChartProvider) {
    var chartFactoryMap = {
        "Box Plot": boxPlotProvider,
        "Scattered Plot": scatteredChartProvider,
        "Pie Chart": pieChartProvider,
        "Column Chart": columnChartProvider
    };
    return {
        getSpecificChartService: function(chartType){
            return chartFactoryMap[chartType];
        },
        getHighchartOptions: function (chartScope) {
            return chartFactoryMap[chartScope.chartProperties.type].produceChartOption(chartScope.chartProperties, chartScope,
                                                                chartScope.chartProperties.dataToShow !== "all");
        },
        getRelevantProperties: function(chartProperties){
            if( chartProperties.type === "Pie Chart" || chartProperties.type === "Box Plot" )
                return ["group_by", "analytic"];
            else if( chartProperties.type === "Scattered Plot" )
                return ["x_attribute", "y_attribute", "radius", "group_by"];
            else if( chartProperties.type === "Column Chart" )
                return ["x_attribute", "y_attribute", "group_by"];
        },
        getRequiredProperties: function(chartProperties){
            if( chartProperties.type === "Pie Chart" || chartProperties.type === "Box Plot" )
                return ["group_by", "analytic"];
            else if( chartProperties.type === "Scattered Plot" || chartProperties.type === "Column Chart" )
                return ["x_attribute", "y_attribute"];
        },
        regressionTypes:  [
            {
                tag: 'linear',
                text: "Linear"
            },
            {
                tag: 'polynomial',
                text: "Polynomial"
            },
            {
                tag: 'logarithmic',
                text: "Logarithmic"
            },
            {
                tag: 'exponential',
                text: 'Exponential'
            }
        ]
    }
});

angular.module('decorated-high-charts').factory('pieChartProvider', function (commonHighchartConfig) {
    return {
        produceChartOption: function (chartProperties, chartScope, onlyOnSelectedRows) {
            var cfgTemplate = _.extend(_.clone(commonHighchartConfig(chartScope)),
                {
                    chart: {
                        type: "pie",
                        marginTop: 40,
                        height: chartScope.states.chart ? chartScope.states.chart.chartHeight : undefined,
                        width: chartScope.states.chart ? chartScope.states.chart.chartWidth : undefined
                    },
                    plotOptions: {
                        pie: {
                            dataLabels: {
                                formatter: function () {
                                    return this.point.name == "null" ? "N/A" : this.point.name;
                                }
                            }
                        }
                    },
                    tooltip: {
                        formatter: function () {
                            return ("<b>" + this.series.name + "</b>: " + this.point.name + "<br/>" +
                            "<b>Percent of Pie</b>: " + numeral(this.percentage).format('0,0.00') + "%<br/>" +
                            "<b>Total for Slice</b>: " + numeral(this.y / 1000).format('0,0') + "<br/>" +
                            "<b>Total for Pie</b>: " + numeral(this.total / 1000).format('0,0'));
                        },
                        pie: {
                            allowPointSelect: true,
                            cursor: 'pointer',
                            dataLabels: {
                                enabled: true,
                                format: '<b>{point.name}</b>: {point.percentage:.1f} %',
                                style: {
                                    color: (Highcharts.theme && Highcharts.theme.contrastTextColor) || 'black'
                                }
                            }
                        }
                    }
                }
            );
            var toGroupBy = chartProperties.group_by.colTag;
            var groupedAnalytic = _.groupBy(getValidDataScope(onlyOnSelectedRows, chartScope), toGroupBy);

            var categories = _.keys(groupedAnalytic);
            var pieSeries = [];
            var data = [];
            _.each(categories, function (category) {
                var value = aggregate(groupedAnalytic[category], chartProperties.analytic);
                var dataPoint = {name: category, y: value};
                data.push(dataPoint);
            });
            pieSeries.push({
                name: chartProperties.group_by.text,
                data: data
            });
            var cfg = _.clone(cfgTemplate);
            if (categories.length < 10)
                cfg.series = pieSeries;
            else
                cfg.subtitle = {text: '* Too Many Slices of Pie to Display from Grouping by ' + chartProperties.group_by.text + ' *'};
            cfg.title.text = chartProperties.group_by.text + " weighted by " + chartProperties.analytic.text;
            return cfg;
        }
    };
});

angular.module('decorated-high-charts').factory('boxPlotProvider', function (commonHighchartConfig) {
    return {
        produceChartOption: function (chartProperties, chartScope, onlyOnSelectedRows) {
            var cfgTemplate = _.extend(_.clone(commonHighchartConfig(chartScope)), {
                chart: {
                    type: 'boxplot',
                    marginTop: 40,
                    height: chartScope.states.chart ? chartScope.states.chart.chartHeight : undefined,
                    width: chartScope.states.chart ? chartScope.states.chart.chartWidth : undefined
                },
                title: {
                    text: null
                },
                tooltip: {
                    valueDecimals: 2
                },
                legend: {
                    enabled: false
                },
                plotOptions: {},
                xAxis: {
                    labels: {
                        formatter: function () {
                            return this.value == "null" ? "N/A" : this.value;
                        }
                    }
                },
                yAxis: {
                    title: {
                        text: null
                    }
                },
                series: null,
                credits: {
                    enabled: false
                }
            });
            var toGroupBy = chartProperties.group_by.colTag;
            var analytic = chartProperties.analytic.colTag;
            var groupedAnalytic = _.groupBy(getValidDataScope(onlyOnSelectedRows, chartScope), toGroupBy);
            var categories = _.keys(groupedAnalytic);
            var boxPlotData = [];
            _.each(categories, function (category) {
                var data = _.pluck(groupedAnalytic[category], analytic);
                boxPlotData.push(
                    [ss.min(data), ss.quantile(data, 0.25), ss.median(data), ss.quantile(data, 0.75), ss.max(data)]
                );
            });
            var boxPlotSeries = {name: chartProperties.analytic.text, data: boxPlotData};
            var cfg = _.clone(cfgTemplate);
            cfg.xAxis.categories = categories;
            cfg.xAxis.title = cfg.xAxis.title ? cfg.xAxis.title : {};
            cfg.xAxis.title.text = chartProperties.group_by.text;
            cfg.yAxis.title.text = chartProperties.analytic.text;
            if (categories.length < 15)
                cfg.series = [boxPlotSeries];
            else
                cfg.subtitle = {text: '* Too Many Boxes to Display from Grouping by ' + chartProperties.group_by.text + ' *'};

            cfg.title.text = chartProperties.analytic.text + ' by ' + chartProperties.group_by.text;
            return cfg;
        }
    }
});

angular.module('decorated-high-charts').factory('scatteredChartProvider', function (dhcStatisticalService,
                                                            commonHighchartConfig, dhcSeriesColorService, $timeout) {

    /**
     * Transforms data from disparate data structures into a Highchart Series ready for plotting
     * @param categories category represent a separate series to be plotted, this is useful to distinguish data from different issuers/tickers/sectors for example
     * @param radius the radius attribute (if applicable)
     * @param groupedData the raw data grouped by the categories provided
     * @param xAttr the x-axis attribute to extract from members of groupedData
     * @param yAttr the y-axis attribute to extract from members of groupedData
     * @param stdevForOutlierRemoval the number of stdev beyond which outliers should be excluded (could be null to not remove anything)
     * @returns {Array}
     */
    function generateSeries(categories, radius, groupedData, xAttr, yAttr, stdevForOutlierRemoval, chartScope, propertiesHash) {
        var series = [];
        _.each(categories, function (category) {
            var data = [];
            // pick out x, y or Radius
            if (radius != null) {
                _.each(groupedData[category], function (item) {
                    if (item[xAttr.colTag] != null && item[yAttr.colTag] && chartScope.apiHandle.api.excludedPoints.indexOf(item[chartScope.key]) == -1)
                        data.push({
                            id: item[chartScope.key],
                            name: item[chartScope.key],
                            x: item[xAttr.colTag],
                            y: item[yAttr.colTag],
                            z: item[radius.colTag]
                        });
                });
            } else {
                _.each(groupedData[category], function (item) {
                    if (item[xAttr.colTag] != null && item[yAttr.colTag] && chartScope.apiHandle.api.excludedPoints.indexOf(item[chartScope.key]) == -1)
                        data.push({
                            id: item[chartScope.key],
                            name: item[chartScope.key],
                            x: item[xAttr.colTag],
                            y: item[yAttr.colTag]
                        });
                });
            }
            data = data.sort(function (a, b) {
                return a.x - b.x;
            });

            var result = processData(chartScope.data, stdevForOutlierRemoval, xAttr, yAttr);

            var serObj = {
                name: category == "null" ? "Not Found" : category,
                tooltip: {
                    pointFormat: '<span style="color:{series.color}">{point.name}</span><br/><b>' +
                    xAttr.text + '</b>: {point.x:,.2f} <br/><b>' + yAttr.text + '</b>: {point.y:,.2f}' +
                    '<br/>' +
                    '<br/><b>' + xAttr.text + ' &mu;</b>:' + numeral(result.xMean.toFixed(2)).format('0,0.00') +
                    '<br/><b>' + yAttr.text + ' &mu;</b>:' + numeral(result.yMean.toFixed(2)).format('0,0.00') +
                    '<br/>' +
                    '<br/><b>' + xAttr.text + ' &sigma;</b>:' + numeral(result.xStdev.toFixed(2)).format('0,0.00') +
                    '<br/><b>' + yAttr.text + ' &sigma;</b>:' + numeral(result.yStdev.toFixed(2)).format('0,0.00')
                },
                data: data,
                marker: {
                    symbol: 'circle',
                    states: {
                        select: {
                            lineColor: null
                        }
                    }
                },
                color: null
            };

            const seriesColor = dhcSeriesColorService.getOrAssign("chart" + propertiesHash, serObj.name);
            serObj.color = seriesColor;
            serObj.marker.states.select.lineColor = seriesColor;

            if (serObj.data.length > 0)
                series.push(serObj);
        });
        return series;
    }

    /**
     * TODO merge with regressionJSWrapper
     * Fit a simple line through the given series and return some high level statistics
     * @param series used as the input of the regression
     * @param chartId the current chartId so we can retrieve the right series color
     * @returns a Highcharts Series that can be directly used for plotting
     */
    function addFittedLine(series, chartId) {
        var index = 0;
        _.each(series, function (currentSeries) {
            var regressionOutput = dhcStatisticalService.getLinearFit(currentSeries.data);
            var color = dhcSeriesColorService.get("chart" + chartId, currentSeries.name);
            series.push({
                name: currentSeries.name + " Regression (Linear)",
                marker: {
                    enabled: false
                },
                type: "line",
                showInLegend: false,
                enableMouseTracking: false,
                color: color,
                data: regressionOutput.predictedValue
            });
            index++;
        });
        return series;
    }

    /**
     * Wraps around regression JS and help return Highcharts splines  series
     * @param series series used as the input of the regression
     * @param type the primary regression type ex: linear, polynomial
     * @param extraArgs arguments for this regression (such as the degree of polynomial)
     * @param chartId the current chartId so we can retrieve the right series color
     * @returns a Highcharts Series that can be directly used for plotting
     */
    function regressionJSWrapper(series, type, extraArgs, chartId) {
        var index = 0;
        _.each(series, function (currentSeries) {
            if (currentSeries.data.length <= 1)
                return;
            var regressionOutput = dhcStatisticalService.regressionJSWrapper(currentSeries.data, type, extraArgs);
            var color = dhcSeriesColorService.get("chart" + chartId, currentSeries.name);
            series.push({
                name: currentSeries.name + " Regression (" + type + ")",
                marker: {
                    enabled: false
                },
                type: "spline",
                showInLegend: false,
                enableMouseTracking: false,
                color: color,
                data: regressionOutput.predictedValue
            });
            index++;
        });
        return series;
    }

    /**
     * Pre-Process the actual data for what is imminently about to become a Highcharts Series. Perform filtering and aggregate statistics computation
     * @param data
     * @param stdevForOutlierRemoval
     * @param xAttr
     * @param yAttr
     * @returns {{data: *, xMean: (*|number), yMean: (*|number), xStdev: (*|number), yStdev: (*|number)}}
     */
    function processData(data, stdevForOutlierRemoval, xAttr, yAttr) {
        var yData = _.chain(data).pluck(yAttr.colTag).compact().value(),
            xData =  _.chain(data).pluck(xAttr.colTag).compact().value();
        var xMean = ss.mean(xData), xStdev = ss.standard_deviation(xData),
            yMean = ss.mean(yData), yStdev = ss.standard_deviation(yData), filteredData;

        if (stdevForOutlierRemoval)
            filteredData = _.filter(data, function (datum) {
                var xCutoff = Math.abs(xMean - datum[xAttr.colTag]), yCutoff = Math.abs(yMean - datum[yAttr.colTag]);
                return xCutoff < stdevForOutlierRemoval * xStdev && yCutoff < stdevForOutlierRemoval * yStdev;
            });
        else
            filteredData = data;

        return {
            data: filteredData,
            xMean: xMean || 0.0,
            yMean: yMean || 0.0,
            xStdev: xStdev || 0.0,
            yStdev: yStdev || 0.0
        };
    }

    return {
        addRegression: function (series, type, extraArgs, id) {
            if (type)
                return regressionJSWrapper(series, type, extraArgs, id);
            else
                return addFittedLine(series, id);
        },
        removeRegression: function (series) {
            for (var i = 0; i < series.chart.series.length; i++) {
                if (series.color == series.chart.series[i].color && series.chart.series[i].name.match("Regression")) {
                    series.chart.series[i].remove();
                    break;
                }
            }
        },
        redrawRegression: function (series, chartProperties) {
            this.removeRegression(series);
            if (series.data.length > 1) {
                if (chartProperties.regression === "linear") {
                    var regressionOutput = dhcStatisticalService.getLinearFit(series.data);
                    var color = dhcSeriesColorService.get("chart" + chartProperties.$$hashKey, series.name);
                    series.chart.addSeries({
                        name: series.name + " Regression (Linear)",
                        marker: {
                            enabled: false
                        },
                        type: "line",
                        showInLegend: false,
                        enableMouseTracking: false,
                        color: color,
                        data: regressionOutput.predictedValue
                    });
                }
                else if (chartProperties.regression != null && chartProperties.regression != "") {
                    var extraArg = chartProperties.regression === "polynomial" ? chartProperties.regression_degree : null;
                    var regressionOutput = dhcStatisticalService.regressionJSWrapper(series.data, chartProperties.regression, extraArg);
                    var color = dhcSeriesColorService.get("chart" + chartProperties.$$hashKey, series.name);
                    series.chart.addSeries({
                        name: series.name + " Regression (" + chartProperties.regression + ")",
                        marker: {
                            enabled: false
                        },
                        type: "spline",
                        showInLegend: false,
                        enableMouseTracking: false,
                        color: color,
                        data: regressionOutput.predictedValue
                    });
                }
            }
        },
        produceChartOption: function (chartProperties, chartScope, onlyOnSelectedRows) {
            var cfgTemplate = _.extend(_.clone(commonHighchartConfig(chartScope)), {
                chart: {
                    type: 'scatter',
                    zoomType: 'xy',
                    marginTop: 10,
                    height: chartScope.states.chart ? chartScope.states.chart.chartHeight : undefined,
                    width: chartScope.states.chart ? chartScope.states.chart.chartWidth : undefined
                },
                legend: {
                    enabled: true
                },
                series: [],
                credits: {
                    enabled: false
                }
            });
            var obj = this;
            dhcSeriesColorService.removePalate("chart" + chartProperties.$$hashKey);
            var xAttr = chartProperties.x_attribute,
                yAttr = chartProperties.y_attribute,
                radius = chartProperties.radius,
                groupByAttr = chartProperties.group_by,
                series = [], cfg = _.clone(cfgTemplate), groupedData = {};
            if ((getValidDataScope(onlyOnSelectedRows, chartScope)).length <= TURBO_THRESHOLD) {  // && not a special chart
                var result = processData(getValidDataScope(onlyOnSelectedRows, chartScope), chartProperties.outlier_remove, xAttr, yAttr);
                var data = result.data;

                if (groupByAttr != null)
                    groupedData = _.groupBy(data, groupByAttr.colTag);
                else
                    groupedData[chartProperties.x_attribute.text] = data;

                var categories = _.keys(groupedData);

                series = generateSeries.call(this, categories, radius, groupedData, xAttr, yAttr, chartProperties.outlier_remove, chartScope, chartProperties.$$hashKey);
                // get correct regression color
                if (chartProperties.regression === "linear")
                    addFittedLine(series, chartProperties.$$hashKey);
                else if (chartProperties.regression != null && chartProperties.regression != "") {
                    var extraArg = chartProperties.regression === "polynomial" ? chartProperties.regression_degree : null;
                    regressionJSWrapper(series, chartProperties.regression, extraArg, chartProperties.$$hashKey);
                }
            } else
                cfg.subtitle = {text: '* Too Many Data Points to Plot - (Future Versions will Implement Random Sampling and Drilldown Features) *'};

            if (radius != null)
                cfg.chart.type = "bubble";
            else
                cfg.chart.type = "scatter";

            if (series.length > 10) {
                cfg.subtitle = {text: '* Too Many Series to Plot *'};
            }
            else
                cfg.series = series;

            // Only have legend if there is more than non-regression series
            cfg.legend.enabled = _.reject(series, function(ser){
                return ser.type === "spline";
            }).length > 1;

            if ( chartScope.chartOptions && chartScope.chartOptions.alwaysEnableLegend )
                cfg.legend.enabled = true;

            cfg.xAxis.title.text = xAttr.text;
            cfg.yAxis.title.text = yAttr.text;
            cfg.title.text = xAttr.text + " vs. " + yAttr.text;

            cfg.plotOptions = {
                series: {
                    events: {
                        // Hide regression line when a series is hidden
                        legendItemClick: function(){
                            var thisRe = new RegExp("^" + this.name + " Regression");
                            _.each(this.chart.series, function(ser){
                                if( ser.name.match(thisRe) )
                                    ser.visible ? ser.hide() : ser.show();
                            });
                            return true;
                        }
                    },
                    point: {
                        events: {
                            click: function(e){
                                e.stopPropagation();
                                if( chartScope.scatterPlotPointClickCallback({point: this}) ){
                                    chartScope.apiHandle.api.togglePoint(this.id);
                                }
                            },
                            mouseOver: function(){
                                const point = this;

                                chartScope.$flexibleRemoveBtn.detach();
                                chartScope.$flexibleRemoveBtn.off('click');
                                chartScope.$flexibleRemoveBtn.on('click', function () {
                                    $timeout(function(){
                                        if (point.id && chartScope.apiHandle.api.excludedPoints.indexOf(point.id) == -1) {
                                            chartScope.apiHandle.api.excludedPoints.push(point.id);
                                            //if (!scope.resetButton.active)
                                            //    scope.resetButton.active = true;
                                            const series = point.series;
                                            chartScope.pointRemovalCallback({point: point});
                                            if( point && point.remove )
                                                point.remove();
                                            if( series && series.options ) {
                                                const isAPointInAdHocSeries = _.reduce(chartScope.states.adHocSeriesOptions, function (memo, ser) {
                                                    return memo || ser.id === series.options.id
                                                }, false);
                                                if (!isAPointInAdHocSeries)
                                                    obj.redrawRegression(series, chartProperties);
                                            }
                                        }
                                        chartScope.$flexibleRemoveBtn.detach();
                                    });
                                });

                                chartScope.$flexibleRemoveBtn.css({
                                    'top': (this.series.chart.yAxis[0].toPixels(this.y) - 15) + 'px',
                                    'left': (this.series.chart.xAxis[0].toPixels(this.x)) + 'px'
                                });

                                chartScope.$flexibleRemoveBtn.appendTo($(chartScope.highchartDOMElem));
                            }
                        }
                    }
                }
            };

            cfg.tooltip.hideDelay = 0;

            if (chartProperties.show_datalabel) {
                cfg.plotOptions[cfg.chart.type] = {
                    dataLabels: {
                        allowOverlap: false,
                        enabled: true,
                        formatter: function () {
                            return this.point.name
                        }
                    }
                }
            }
            else
                delete cfg.plotOptions[cfg.chart.type];

            return cfg;
        }
    }
});

angular.module('decorated-high-charts').factory('commonHighchartConfig', function () {
    $.extend(Highcharts.Renderer.prototype.symbols, {
        X: function (a, b, c, d) {
            return ["M", a, b, "L", a + c, b + d, "M", a + c, b, "L", a, b + d]
        }
    });
    function getCommonCfg(chartScope) {
        return _.extend({
                chart: {
                    animation: false,
                    marginTop: -12
                },
                title: {
                    text: "",
                    events: {
                        click: function (e) {
                            e.preventDefault();
                            e.stopPropagation();
                            dhc.onTitleClick(e, chartScope, this);
                        }
                    }
                },
                plotOptions: {
                    series: {turboThreshold: TURBO_THRESHOLD}
                },
                exporting: {
                    enabled: false
                },
                tooltip: {
                    valueDecimals: 2,
                    useHTML: true,
                    delayForDisplay: 1000
                },
                credits: {
                    enabled: false
                },
                xAxis: {
                    title: {
                        events: {
                            click: function (event) {
                                dhc.onAxisClick.call(this, event, chartScope);
                            }
                        }
                    }
                },
                yAxis: {
                    title: {
                        events: {
                            click: function (event) {
                                dhc.onAxisClick.call(this, event, chartScope);
                            }
                        }
                    }
                }
            }, chartScope.chartOptions.highchartsOverlay ? chartScope.chartOptions.highchartsOverlay : {}
        );
    }
    return function(chartScope) {
        return _.clone(getCommonCfg(chartScope));
    };
});



angular.module('decorated-high-charts').factory('columnChartProvider', function (commonHighchartConfig) {

    return {
        produceChartOption: function (chartProperties, chartScope, onlyOnSelectedRows) {

            var cfgTemplate = _.extend(_.clone(commonHighchartConfig(chartScope)), {
                chart: {
                    type: 'column',
                    height: chartScope.states.chart ? chartScope.states.chart.chartHeight : undefined,
                    width: chartScope.states.chart ? chartScope.states.chart.chartWidth : undefined
                },
                xAxis: {title: {text: null}, showEmpty: false},
                yAxis: {title: {text: null}, showEmpty: false},
                plotOptions: {
                    column: {
                        pointPadding: 0.2,
                        borderWidth: 0
                    }
                }
            });

            cfgTemplate.chart.height = chartScope.states.chart ? chartScope.states.chart.chartHeight : undefined;
            cfgTemplate.chart.width = chartScope.states.chart ? chartScope.states.chart.chartWidth : undefined;

            // TODO correct rough around the edges - i.e. aggregation logic for average and count, labels etc
            var x = chartProperties.x_attribute,
                y = chartProperties.y_attribute, groupedAnalytic = {};

            if (chartProperties.group_by)
                groupedAnalytic = _.groupBy(getValidDataScope(onlyOnSelectedRows, chartScope), chartProperties.group_by.colTag);
            else
                groupedAnalytic[x.text] = getValidDataScope(onlyOnSelectedRows, chartScope);

            var categories = _.keys(groupedAnalytic);
            var xValues = _.uniq(_.pluck(getValidDataScope(onlyOnSelectedRows, chartScope), x.colTag));
            var series = [];

            _.each(categories, function (category) {
                var categoryData = groupedAnalytic[category];
                var data = _.map(xValues, function (xValue) {
                    var toAggregate = _.filter(categoryData, function (item) {
                        return item[x.colTag] == xValue;
                    });
                    return aggregate(toAggregate, y);
                });
                category = category == "null" ? "N/A " + chartProperties.group_by.text : category;
                series.push({
                    name: category,
                    data: data
                });
            });
            var cfg = _.clone(cfgTemplate);

            if (categories.length * series.length < 50)
                cfg.series = series;
            else
                cfg.subtitle = {text: '* Too Many Bars to Display *'};

            xValues = _.map(xValues, function (item) {
                return item == null ? "N/A " + chartProperties.x_attribute.text : item;
            });
            cfg.xAxis.categories = xValues;
            cfg.xAxis.title = cfg.xAxis.title ? cfg.xAxis.title : {};
            cfg.xAxis.title.text = chartProperties.x_attribute.text;
            cfg.yAxis.title.text = chartProperties.y_attribute.text;
            cfg.title.text = y.text + " by " + x.text;
            // Only have legend if there is more than non-regression series
            cfg.legend = cfg.legend || {};
            cfg.legend.enabled = series.length > 1;
            return cfg;
        }
    }
});

angular.module('decorated-high-charts').factory('dhcSeriesColorService', function () {
    const colors = [
        "#0079C1", "#009A3D", "#6C207E", "#E31B23", "#F8971D",
        "#FFD200", "#59BD81", "#59A7D7", "#9F6FAA", "#ED6B70",
        "#FABB6B", "#FFE159", "#325CBA", "#3CB54B",
        "#092A59", "#BB4B31", "#32A0BA", "#B98F2F",
        "#849DD0", "#8DCC92", "#6C809C", "#85C6D5",
        "#D69383", "#D5BC81", "#C9D4ED", "#ADBEE2", "#B3DBB6",
        "#787878", "#9DAABD", "#ADD9E3", "#E4B7AD", "#E3D3AC",
        "#A1B5DD", "#D8ECDA", "#555555", "#CEBDDE",
        "#D6ECF1", "#F1DBD5", "#5474B9"
    ];
    return {
        palate: colors,
        altPalate: angular.copy(colors).reverse(),
        fullPalate: {},
        get: function (palateName, key) {
            return this.fullPalate[palateName] && this.fullPalate[palateName][key] ? this.fullPalate[palateName][key] : null;
        },
        put: function (palateName, key, color) {
            if (!this.fullPalate[palateName])
                this.fullPalate[palateName] = {};

            this.fullPalate[palateName][key] = color;
        },
        remove: function (palateName, key) {
            if (this.fullPalate[palateName] && this.fullPalate[palateName][key])
                delete this.fullPalate[palateName][key];
        },
        removePalate: function (palateName) {
            if (this.fullPalate[palateName])
                delete this.fullPalate[palateName];
        },
        assign: function (palateName, key, useAltPalate) {
            if (!this.fullPalate[palateName])
                this.fullPalate[palateName] = {};

            const palateToUse = useAltPalate ? this.altPalate : this.palate;

            var indexToUse = Object.keys(this.fullPalate[palateName]).length;
            this.put(palateName, key, palateToUse[indexToUse % palateToUse.length]);
            return palateToUse[indexToUse];
        },
        getOrAssign: function (palateName, key, useAltPalate) {
            var color = this.get(palateName, key);
            return color ? color : this.assign(palateName, key, useAltPalate);
        },
        resetPalate: function () {
            this.fullPalate = {};
        }
    }
});


angular.module('decorated-high-charts').factory('dhcStatisticalService', function () {
    return {
        /**
         * @param data
         *          must be of 2-dimensional paired form - i.e. [[a,b],[c,d] ... ]
         */
        getLinearFit: function (data) {
            var dataArray = _.map(data, function (point) {
                return [point.x, point.y];
            });
            if (dataArray.length != 0) {
                // get regression line
                var regression = ss.linear_regression().data(dataArray);
                var cols = _.zip.apply(_, dataArray);
                var correlation = ss.sample_correlation(cols[0], cols[1]);
                var linearFn = regression.line();
                // apply predicted line to x data
                var predictedValue = _.map(dataArray, function (pt) {
                    return [pt[0], linearFn(pt[0])];
                });
                return {
                    predictedValue: predictedValue,
                    beta: regression.m(),
                    intercept: regression.b(),
                    correlation: correlation
                }
            } else {
                return {
                    predictedValue: [],
                    beta: 0,
                    intercept: 0,
                    correlation: 0
                }
            }
        },
        regressionJSWrapper: function (data, type, extraArg) {
            var dataArray = _.map(data, function (datum) {
                return [datum.x, datum.y]
            });
            if (dataArray.length != 0) {
                var scrubbedData = _.filter(dataArray, function (row) {
                    return row[0] && row[0];
                });
                if(type === 'exponential'){
                    var nonNegativeData = _.filter(scrubbedData, function(data){return data[1] > 0}); //Filters out the data points which include negative OAS.
                    scrubbedData = nonNegativeData;
                }
                var regressionOutput = regression(type, scrubbedData, extraArg);
                var predictedValue = regressionOutput.points;
                predictedValue.sort(function (a, b) {
                    return a[0] - b[0];
                });
                return {
                    predictedValue: predictedValue,
                    equation: regressionOutput.string
                }
            } else {
                return {
                    predictedValue: [],
                    equation: ''
                }
            }
        }
    }
});

function getValidDataScope(onlyOnSelectedRows, chartDataUniverse){
    return onlyOnSelectedRows ? chartDataUniverse.getSelectedRowsData() : chartDataUniverse.data;
}

function aggregate(dataToAgg, y) {
    var aggFnMap = {
        "SUM": ss.sum,
        "AVERAGE": ss.average,
        "COUNT": function (x) {
            return _.uniq(x).length;
        },
        "COUNT_AND_DISTINCT": function (x) {
            return _.uniq(x).length;
        }
    };
    var dataArray = _.pluck(dataToAgg, y.colTag);
    var aggFn = aggFnMap[y.aggregationMethod];
    return aggFn(dataArray);
}

(function () {
    const root = this; // this == window
    const dhc = root.dhc || {};
    root.dhc = dhc;

    function extractHtmlFromScatter(chart){
        var headers = "", body = "";
        // Construct first row of names of series
        headers = "<tr>" + _.map(chart.series, function(ser){
            return "<th colspan='2' style='background-color: #0069d6; color: #ffffff;'>" + ser.name + "</th>"
        }).join('') + "</tr>";

        // Construct second row of x & y titles
        headers += "<tr>" + _.map(chart.series, function(){
                return "<th style='background-color: #7fb4ea;'>" + chart.options.xAxis[0].title.text + " (x)</th>" +
                       "<th style='background-color: #7fb4ea;'>" + chart.options.yAxis[0].title.text + " (y)</th>";
        }).join('') + "</tr>";

        // Get longest length of data array for all series in this chart
        const maxLength = _.chain(chart.series).map(function(ser){
            return ser.data.length;
        }).value().sort(function(a, b){return b-a})[0];

        // Construct data
        body = _(maxLength).times(function(index){
            var row = "<tr>";
            row += _.map(chart.series, function(ser){
                var cellX = "<td>" + (ser.data.length > index ? ser.data[index].x : "") + "</td>";
                var cellY = "<td>" + (ser.data.length > index ? ser.data[index].y : "") + "</td>";
                return cellX + cellY;
            }).join('');
            row += "</tr>";
            return row;
        }).join('');
        return headers + body;
    }

    function extractHtmlFromColumn(chart){
        // Construct first row of names of series
        var headers = "<tr><th style='background-color: #0069d6; color: #ffffff;'></th>" + _.map(chart.series, function(ser){
                return "<th style='background-color: #0069d6; color: #ffffff;'>" + ser.name + "</th>"
            }).join('') + "</tr>";

        // Construct data
        var body = _.map(chart.xAxis[0].categories, function(category){
            var cells = "<td>" + category + "</td>";
            cells += _.map(chart.series, function(ser){
                var foundCategory = _.findWhere(ser.data, {category: category});
                return "<td>" + (foundCategory && foundCategory.y ? foundCategory.y : "") + "</td>";
            }).join('');
            return "<tr>" + cells + "</tr>";
        }).join('');

        return headers + body;
    }

    function extractHtmlFromPie(chart){
        var groupingBy = chart.options.title.text.split(" weighted by ")[1];

        // Construct first row of names of series
        var headers = "<tr><th style='background-color: #0069d6; color: #ffffff;'>" + chart.series[0].name + "</th>" +
                  "<th style='background-color: #0069d6; color: #ffffff;'>" + groupingBy + "%</th>" +
                  "<th style='background-color: #0069d6; color: #ffffff;'>Total " + groupingBy + "</tr>";

        // Construct data
        var body = _.map(chart.series[0].data, function(datum){
            var cells = "<td>" + datum.name + "</td>";
            cells += "<td>" + datum.percentage + "</td>";
            cells += "<td>" + datum.y + "</td>";
            return "<tr>" + cells + "</tr>";
        }).join('');

        return headers + body;
    }

    function extractHtmlFromBoxPlot(chart){
        // Construct first row of names of series
        var headers = "<tr><th style='background-color: #0069d6; color: #ffffff;'>" + chart.options.xAxis[0].title.text + "</th>" +
            "<th style='background-color: #0069d6; color: #ffffff;'>" + chart.options.yAxis[0].title.text + " Low</th>" +
            "<th style='background-color: #0069d6; color: #ffffff;'>" +  chart.options.yAxis[0].title.text + " Q1</th>" +
            "<th style='background-color: #0069d6; color: #ffffff;'>" +  chart.options.yAxis[0].title.text + " Median</th>" +
            "<th style='background-color: #0069d6; color: #ffffff;'>" +  chart.options.yAxis[0].title.text + " Q3</th>" +
            "<th style='background-color: #0069d6; color: #ffffff;'>" +  chart.options.yAxis[0].title.text + " High</th>";

        // Construct data
        var body = _.map(chart.series[0].data, function(datum){
            var cells = "<td>" + datum.category + "</td>";
            cells += "<td>" + datum.low + "</td>";
            cells += "<td>" + datum.q1 + "</td>";
            cells += "<td>" + datum.median + "</td>";
            cells += "<td>" + datum.q3 + "</td>";
            cells += "<td>" + datum.high + "</td>";
            return "<tr>" + cells + "</tr>";
        }).join('');

        return headers + body;
    }
    /**
     * takes an array of Highcharts.Series and serialize them into HTML text wrapped in a table
     * @param series
     * @return {string}
     */
    dhc.chartToHTML = function (chart) {
        var html = "";
        if( chart.series.length > 0) {
            switch (chart.options.chart.type) {
                case "scatter":
                    html = extractHtmlFromScatter(chart);
                    break;
                case "column":
                    html = extractHtmlFromColumn(chart);
                    break;
                case "pie":
                    html = extractHtmlFromPie(chart);
                    break;
                case "boxplot":
                    html = extractHtmlFromBoxPlot(chart);
                    break;
                default:
                    break;
            }
        }
        return "<table>" + html + "</table>";
    }
}());

/**
 * this module exposes the 'dhc' object which contains utility and helper functions for the main angular directive
 */
(function () {
    const root = this; // this == window
    const dhc = root.dhc || {};
    root.dhc = dhc;

    /**
     * choose the correct yAxis to add a new series into
     * if no preferred axis is found return -1
     * @param chart
     * @param seriesOption
     */
    root.dhc.resolvePreferredYAxis = function (chart, seriesOption) {
        if (!seriesOption.axisType)
            return chart.yAxis.length === 0 ? -1 : 0;
        return _.findIndex(chart.yAxis, function (axis) {
            return axis.userOptions.axisType === seriesOption.axisType;
        });
    };

    /**
     * Add a new axis to the given chart. wires up event handler and such.
     * axis are also labeled with axisType, which enables intelligent axis
     * selection when new series is being added
     *
     * @param chart a Highchart object
     * @param name the name of the axis
     * @param scope the scope object (we need this for the axis click event handler)
     * @param axisType a member of the axisType enum
     * @return {string}
     */
    root.dhc.addAxisToChart = function (chart, name, scope, axisType) {
        const axisId = _.uniqueId("yAxis");
        chart.addAxis({
            title: {
                text: name,
                events: {
                    click: function (event) {
                        dhc.onAxisClick.call(this, event, scope);
                    }
                }
            },
            axisType: axisType,
            opposite: chart.options.yAxis.length % 2 == 0,
            id: axisId
        });
        return chart.get(axisId);
    };

    /**
     * attaches event listener that triggers a context menu appearance when legend item is right-clicked
     * @param series
     * @param scope
     */
    root.dhc.attachLegendEventHandlers = function (series, scope) {
        if( series.legendItem && series.legendItem.element)
            $(series.legendItem.element)
                .css({"user-select": "none"})
                .mousedown(function (event) {
                    if (event.button == 2) {
                        event.preventDefault();
                        event.stopPropagation();
                        return dhc.triggerSeriesContextMenu(event, {
                            series: series,
                            scope: scope
                        });
                    }
                })
    };

    /**
     * handles user click on an axis
     * @param event
     * @param scope
     */
    root.dhc.onAxisClick = function (event, scope) {
        event.preventDefault();
        event.stopPropagation();

        const axis = this;
        // empty existing context menu - add axis specific menu items
        const $ctxMenu = scope.$ctxMenu;
        $ctxMenu.find(".dropdown-menu li").remove();

        function editAxisTitle() {
            const $input = $("<input type='text' class='form-control' style='position:relative; left: 10%; width: 80%;'/>");
            $input.val(axis.axisTitle.textStr);
            $input.on('keydown', function (keyEvent) {
                if (keyEvent.keyCode == 13 && $input.val() != "") {
                    keyEvent.preventDefault();
                    keyEvent.stopPropagation();
                    axis.setTitle({text: $input.val()});
                    $ctxMenu.hide();
                }
            });
            const $menuItem = $("<li><span></span></li>")
                .click(dhc.inertClickHandler);
            $menuItem.children("span").append($input);
            //$menuItem.css({"min-width": $input.val().length + "em"});
            return $menuItem;
        }

        $ctxMenu.children(".dropdown-menu")
            .append(editAxisTitle());

        dhc.showCtxMenu($ctxMenu, event);
        // focus on the edit axis title input
        $ctxMenu.find("input.form-control").select();
    };

    /**
     * show the given context menu by figuring out the proper position
     * so that it does not appear off-screen
     * @param $ctxMenu
     * @param event
     */
    root.dhc.showCtxMenu = function ($ctxMenu, event) {
        $ctxMenu.show();
        const $rootDiv = $('div.root');

        const ctnRight = $rootDiv.position().left + $rootDiv.width();
        const menuRight = event.clientX + $ctxMenu.children().width();

        const ctnBtm = $rootDiv.position().top + $rootDiv.height();
        const menuBtm = event.clientY + $ctxMenu.children().height();

        var left = event.clientX;
        if (menuRight > ctnRight)
            left = Math.max(event.clientX - $ctxMenu.children().width(), 0);

        var top = event.clientY;
        if (menuBtm > ctnBtm)
            top = event.clientY - $ctxMenu.children().height();

        $ctxMenu.css({
            top: top + "px",
            left: left + "px"
        });
    };

    /**
     * a click event handler that does nothing and prevents propagation
     * @param e
     */
    root.dhc.inertClickHandler = function (e) {
        e.preventDefault();
        e.stopPropagation();
    };

    /**
     * moves an series from its current axis to the specified axis
     * @param series
     * @param targetAxis
     * @param scope
     */
    root.dhc.moveAxis = function (series, targetAxis, scope) {
        const origAxis = series.yAxis;
        const seriesOptions = series.options;
        // figure out the position
        seriesOptions.yAxis = _.findIndex(scope.states.chart.yAxis, function (x) {
            return x.userOptions.id == targetAxis.userOptions.id;
        });
        seriesOptions.color = series.color;
        series.remove();
        scope.addSeries(seriesOptions);
        if (dhc.isAxisEmpty(origAxis))
            origAxis.remove();

    };

    /**
     * generates the Series ID for security time series
     * @param security
     * @param attr
     * @returns {string}
     */
    root.dhc.generateSeriesID = function (security, attr) {
        return ["Security", security.id, attr.tag].join(".");
    };

    /**
     * this is the event handler for the user clicking on the chart title
     */
    root.dhc.onTitleClick = function (clickEvent, scope, chart) {

        const $input = $("<input class='form-control' style='position:relative; left: 5%; width: 90%;'/>");
        const $menuItem = $("<li><span></span></li>");
        $menuItem.on('click', dhc.inertClickHandler).children("span").append($input);

        const $ctxMenu = scope.$ctxMenu;
        $ctxMenu.find(".dropdown-menu li").remove();
        $ctxMenu.children(".dropdown-menu").append($menuItem);

        $input
            .on('keydown', function (keyEvent) {
                if (keyEvent.keyCode == 13 && $input.val() != "") { // ENTER
                    keyEvent.preventDefault();
                    keyEvent.stopPropagation();
                    chart.setTitle({text: $input.val()});
                    $ctxMenu.hide();
                } else if (keyEvent.keyCode == 27) // ESCAPE
                    $ctxMenu.hide();
            })
            .val(chart.options.title.text);

        const titleLength = Math.min($input.val().length, 20);
        $menuItem.css({"min-width": titleLength + "em"});

        dhc.showCtxMenu($ctxMenu, clickEvent);
        $input.select();
    };
    /**
     * test if the given series is the only one left on the given yAxis
     * @param yAxis
     */
    root.dhc.isAxisEmpty = function (yAxis) {
        return yAxis && yAxis.series.length === 0;
    };

    root.dhc.afterSeriesRemove = function (securityId, scope) {

    };

    root.dhc.removeSeriesById = function (id, scope) {

        const chart = scope.states.chart;
        const series = chart.get(id);
        const yAxis = series.yAxis;
        const securityId = series.options.securityId;

        if (angular.isFunction(series.remove))
            series.remove();

        dhc.afterSeriesRemove(yAxis, securityId, scope);
    };


    /**
     * generator function for SMA. Credit: Rosetta Code
     * @param period MA of this period will be taken by the resulting function
     * @returns {Function}
     */
    root.dhc.SMAFactory = function (period) {
        var nums = [];
        return function (num) {
            nums.push(num);
            if (nums.length > period)
                nums.splice(0, 1);  // remove the first element of the array
            var sum = 0;
            for (var i in nums)
                sum += nums[i];
            var n = period;
            if (nums.length < period)
                n = nums.length;
            return (sum / n);
        }
    }
}());

(function () {
    const root = this; // this == window
    const dhc = root.dhc || {};
    root.dhc = dhc;

    /**
     * create the reusable context menu
     * this menu becomes visible when user right-clicks
     * the legend. The menu items in this menu is dynamically generated
     * at the time the right-click event is generated
     *
     * @param elem the parent element to attach the generated context menu
     * @returns {*|jQuery}
     */
    root.dhc.buildContextMenuContainer = function (elem) {
        const $ctxMenu = $(
            "<div style='z-index: 10; position: fixed;'>" +
            "<ul class='clickable dropdown-menu multi-level' style='display: block;'></ul>" +
            "</div>"
        ).hide();
        $ctxMenu.prependTo(elem.children(".root"));
        $(window).click(function () {
            $ctxMenu.hide();
        });
        return $ctxMenu;
    };

    /**
     * event handler for trigger a context menu that is series specific
     * (i.e. right-clicking on a legend or clicking on a series)
     * this code executed when the legend is right-clicked, therefore
     * this is when we mutate the DOM (not before)

     * @param event the mouse click event
     * @param args additional args, containing the series and the scope
     * @returns {boolean}
     */
    root.dhc.triggerSeriesContextMenu = function (event, args) {
        const $ctxMenu = args.scope.$ctxMenu;
        $ctxMenu.find(".dropdown-menu li").remove();
        _.each(dhc.buildMenuItems(args), function (menuItem) {
            $ctxMenu.children(".dropdown-menu").append(menuItem);
        });
        dhc.showCtxMenu($ctxMenu, event);
        return false;
    };

    /**
     * resolve the correct context menu items given the series
     * @param args
     * @returns {*[]}
     */
    root.dhc.buildMenuItems = function (args) {
        const scope = args.scope;
        const seriesTransformer = scope.seriesTransformer;
        const series = args.series;
        const disableTransformation = series.options.disableFurtherTransformation;
        const chart = scope.states.chart;

        /**
         * creates menu item and submenus for transformer functions (i.e. moving avgs etc)
         * @param transformFn
         * @param text
         * @returns {*|jQuery}
         */
        //function transformerMenuItemGenerator(transformFn, text) {
        //    const $input = $("<input type='text' placeholder='Day(s)' class='form-control' style='position: relative; width: 80%; left: 10%;'/>");
        //    return $("<li class='dropdown-submenu'><a>" + text + "</a></li>")
        //        .click(function (e) {
        //            e.preventDefault();
        //            e.stopPropagation();
        //            $input.focus();
        //        })
        //        .append($("<li class='dropdown-menu'><span></span></li>")
        //            .click(dhc.inertClickHandler)
        //            .append($input.on('keydown', function (keyEvent) {
        //                if (keyEvent.keyCode == 13) {
        //                    if (isNaN(parseInt($input.val())) || $input.val() == '')
        //                        return;
        //                    const transformedSeries = transformFn(series, parseInt($input.val()));
        //                    transformedSeries.disableFurtherTransformation = true;
        //                    scope.addSeries(transformedSeries);
        //                    scope.$ctxMenu.hide();
        //                }
        //            })));
        //}

        //const addMA = transformerMenuItemGenerator.bind(null, seriesTransformer.toSimpleMA, "Add Simple MA");

        //const basis = function () {
        //    return $("<li class='dropdown-submenu'><a>Show Basis vs. </a></li>")
        //        .append(dhc.buildSeriesSubMenu({
        //            scope: scope,
        //            onClick: function (event, otherSeries) {
        //                const transformedSeries = seriesTransformer.toBasis(series, otherSeries);
        //                scope.addSeries(transformedSeries);
        //            },
        //            currentSeries: series
        //        }));
        //};

        function changeType() {
            const $subMenu = $("<ul class='dropdown-menu'></ul>");
            _.chain([['Line', 'spline', 'line-chart'], ['Area', 'areaspline', 'area-chart'], ['Column', 'column', 'bar-chart']])
                .filter(function (type) {
                    return type[1] !== series.type;
                })
                .each(function (type) {
                    $("<li><a><i class='fa fa-" + type[2] + "'></i>&nbsp;" + type[0] + "</a></li>")
                        .click(function () {
                            series.update({type: type[1]});
                            // for some chart update wipes out legend event handler
                            // so we reattach them here
                            dhc.attachLegendEventHandlers(series, scope);
                        }).appendTo($subMenu);
                });
            return $("<li class='dropdown-submenu'><a>Change Chart Type</a></li>").append($subMenu);
        }

        const removeSeries = function () {
            return $("<li><a>Remove</a></li>").click(function () {
                scope.$apply(function () {
                    scope.removeSeries(series);
                });
            });
        };
        const changeAxis = function () {
            return $("<li class='dropdown-submenu'><a>Change Axis</a></li>")
                .append(dhc.buildAxesSubMenu(series, chart, scope));
        };
        return disableTransformation ? [removeSeries()]
            : [removeSeries()];
    };

    /**
     * create a sub dropdown for every series in the chart. the functionality of
     * clicking on the menu items in this dropdown will be provided as callbacks
     * since there could be multiple behaviors
     *
     * if args contain a 'currentSeries' property, which is assumed to be of the type Highchart.Series,
     * then this series will not be included in the resulting submenu
     *
     * @param args
     */
    root.dhc.buildSeriesSubMenu = function (args) {
        const chart = args.scope.states.chart;
        const callback = args.onClick;
        const currentSeries = args.currentSeries;
        const $subMenu = $("<ul class='dropdown-menu'></ul>");
        const filteredSeries = _.filter(chart.series, function (series) {
            return currentSeries && series.options.id !== currentSeries.options.id;
        });
        if (filteredSeries.length == 0)
            $subMenu.append("<li><a>No Other Series to Compare To</a></li>");
        else
            _.each(filteredSeries, function (series) {
                $("<li><a>" + series.name + "</a></li>")
                    .click(function (event) {
                        callback(event, series);
                    }).appendTo($subMenu);
            });

        return $subMenu;
    };

    /**
     * create a sub dropdown for every axes in the chart
     * each item in the dropdown triggers a migration of the
     * given series to the axis represented by the item
     * @param series
     * @param chart
     * @param scope
     */
    root.dhc.buildAxesSubMenu = function (series, chart, scope) {
        const $dropdown = $("<ul class='dropdown-menu'></ul>");
        _.each(chart.yAxis, function (axis) {
            var $menuItem;
            if (axis.userOptions.id === series.yAxis.userOptions.id)
                $menuItem = $("<li><a>Y-Axis: " + axis.options.title.text + "&nbsp;<i class='fa fa-check'></i></a></li>");
            else
                $menuItem = $("<li><a>Y-Axis: " + axis.options.title.text + "</a></li>")
                    .click(function () {
                        dhc.moveAxis(series, axis, scope);
                    });
            $dropdown.append($menuItem);
        });
        $dropdown.append($("<li><a><i class=\"fa fa-plus\"></i> Move To New Axis</a></li>").click(function () {
            const axis = dhc.addAxisToChart(chart, series.name, scope, series.userOptions.axisType);
            dhc.moveAxis(series, axis, scope);
        }));
        return $dropdown;
    };

}());
angular.module("decorated-high-charts").run(["$templateCache", function($templateCache) {$templateCache.put("DecoratedHighCharts.html","<div class=\"root\" style=\"position: relative;height:100%\">\r\n    <div class=\"control flex-main-container\">\r\n        <span class=\"flex-sub-container-left\">\r\n            <span ng-hide=\"chartOptions.disablePropertyChooser\">\r\n                <span ng-if=\"chartProperties.type == \'Scattered Plot\'\">\r\n                    <div class=\"restrict-dropdown-menu\" ng-hide=\"chartOptions.disableFirstProperty\">\r\n                        <label>X:</label>\r\n                        <input type=\"text\" ng-model=\"chartProperties.x_attribute\" class=\"form-control\"\r\n                               style=\"width: 12em; display: inline; height:25px;\"\r\n                               placeholder=\"Enter attribute\"\r\n                               typeahead=\"column as column.text for column in getValidColumns(numericalColumns) | filter:$viewValue:$emptyOrMatch | orderBy:\'text.toString()\'\"\r\n                               typeahead-focus\r\n                               typeahead-on-select=\"apiHandle.api.loadChart()\"\r\n                               typeahead-select-on-blur=\"true\"/>\r\n                    </div>\r\n                    <div class=\"restrict-dropdown-menu\" ng-hide=\"chartOptions.disableSecondProperty\">\r\n                        <label>Y:</label>\r\n                        <input type=\"text\" ng-model=\"chartProperties.y_attribute\" class=\"form-control\"\r\n                               style=\"width: 12em; display: inline; height:25px;\"\r\n                               placeholder=\"Enter attribute\"\r\n                               typeahead=\"column as column.text for column in getValidColumns(numericalColumns) | filter:$viewValue:$emptyOrMatch | orderBy:\'text.toString()\'\"\r\n                               typeahead-focus\r\n                               typeahead-on-select=\"apiHandle.api.loadChart()\"\r\n                               typeahead-select-on-blur=\"true\"/>\r\n                    </div>\r\n                </span>\r\n                <span ng-if=\"chartProperties.type == \'Column Chart\'\">\r\n                    <div class=\"restrict-dropdown-menu\" ng-hide=\"chartOptions.disableFirstProperty\">\r\n                        <label>X:</label>\r\n                        <input type=\"text\" ng-model=\"chartProperties.x_attribute\" class=\"form-control\"\r\n                               style=\"width: 12em; display: inline; height:25px;\"\r\n                               placeholder=\"Enter attribute\"\r\n                               typeahead=\"column as column.text for column in getValidColumns(categoricalColumns) | filter:$viewValue:$emptyOrMatch | orderBy:\'text.toString()\'\"\r\n                               typeahead-focus\r\n                               typeahead-on-select=\"apiHandle.api.loadChart()\"\r\n                               typeahead-select-on-blur=\"true\"/>\r\n                    </div>\r\n                    <div class=\"restrict-dropdown-menu\" ng-hide=\"chartOptions.disableSecondProperty\">\r\n                        <label>Y:</label>\r\n                        <input type=\"text\" ng-model=\"chartProperties.y_attribute\" class=\"form-control\"\r\n                               style=\"width: 12em; display: inline; height:25px;\"\r\n                               placeholder=\"Enter attribute\"\r\n                               typeahead=\"column as column.text for column in getValidColumns(numericalColumns) | filter:$viewValue:$emptyOrMatch | orderBy:\'text.toString()\'\"\r\n                               typeahead-focus\r\n                               typeahead-on-select=\"apiHandle.api.loadChart()\"\r\n                               typeahead-select-on-blur=\"true\"/>\r\n                    </div>\r\n                </span>\r\n                <span ng-if=\"chartProperties.type == \'Pie Chart\' || chartProperties.type == \'Box Plot\'\">\r\n                    <div class=\"restrict-dropdown-menu\" ng-hide=\"chartOptions.disableFirstProperty\">\r\n                        <label>Summarize:</label>\r\n                        <input type=\"text\" ng-model=\"chartProperties.analytic\" class=\"form-control\"\r\n                               style=\"width: 12em; display: inline; height:25px;\"\r\n                               placeholder=\"Enter attribute\"\r\n                               typeahead=\"column as column.text for column in getValidColumns(numericalColumns) | filter:$viewValue:$emptyOrMatch | orderBy:\'text.toString()\'\"\r\n                               typeahead-focus\r\n                               typeahead-on-select=\"apiHandle.api.loadChart()\"\r\n                               typeahead-select-on-blur=\"true\"/>\r\n                    </div>\r\n                    <div class=\"restrict-dropdown-menu\" ng-hide=\"chartOptions.disableSecondProperty\">\r\n                        <label style=\"padding-right: 10px;\">Group By:</label>\r\n                        <input type=\"text\" ng-model=\"chartProperties.group_by\" class=\"form-control\"\r\n                               style=\"width: 12em; display: inline; height:25px;\"\r\n                               placeholder=\"Enter attribute\"\r\n                               typeahead=\"column as column.text for column in getValidColumns(categoricalColumns) | filter:$viewValue:$emptyOrMatch | orderBy:\'text.toString()\'\"\r\n                               typeahead-focus\r\n                               typeahead-on-select=\"apiHandle.api.loadChart()\"\r\n                               typeahead-select-on-blur=\"true\"/>\r\n                    </div>\r\n                </span>\r\n            </span>\r\n            <span ng-hide=\"chartOptions.disableMoreOptions\" dhc-click-outside dhc-open-state=\"states.menuDisplays.moreOptions\"\r\n                              dhc-close-callback=\"toggleSlide(!states.menuDisplays.moreOptions,\'more-options\')\">\r\n                <a class=\"clickable\" style=\"text-decoration:none;padding-left:20px;\"\r\n                   ng-click=\"toggleSlide(!states.menuDisplays.moreOptions,\'more-options\');selected=\'\';\">\r\n                    <span class=\"fake-anchor-tag\">More Options</span>\r\n                    <i class=\"fa\" ng-class=\"{\'fa-chevron-up\': states.menuDisplays.moreOptions, \'fa-chevron-down\': !states.menuDisplays.moreOptions}\"></i>\r\n                </a>\r\n                <div class=\"more-options floating-form\" style=\"display: none;width:250px;\">\r\n                    <div ng-if=\"chartProperties.type == \'Scattered Plot\'\">\r\n                        <label style=\"padding-right: 10px;\">Group By:</label>\r\n                        <div class=\"restrict-dropdown-menu input-group\">\r\n                            <input type=\"text\" class=\"form-control\"\r\n                                   ng-model=\"chartProperties.group_by\"\r\n                                   typeahead=\"column as column.text for column in getValidColumns(categoricalColumns) | filter:$viewValue:$emptyOrMatch | orderBy:\'text.toString()\'\"\r\n                                   typeahead-on-select=\"apiHandle.api.loadChart()\"\r\n                                   typeahead-focus/>\r\n                            <span class=\"dhc-clickable input-group-addon\" ng-click=\"chartProperties.group_by = undefined;apiHandle.api.loadChart()\">\r\n                                <strong>X</strong>\r\n                            </span>\r\n                        </div>\r\n                        <label>Radius:&nbsp;</label>\r\n                        <div class=\"restrict-dropdown-menu input-group\">\r\n                            <input type=\"text\" class=\"form-control\"\r\n                                   ng-model=\"chartProperties.radius\"\r\n                                   typeahead=\"column as column.text for column in getValidColumns(numericalColumns) | filter:$viewValue:$emptyOrMatch | orderBy:\'text.toString()\'\"\r\n                                   typeahead-on-select=\"apiHandle.api.loadChart()\"\r\n                                   typeahead-focus/>\r\n                            <span class=\"dhc-clickable input-group-addon\" ng-click=\"chartProperties.radius = undefined;apiHandle.api.loadChart()\">\r\n                                <strong>X</strong>\r\n                            </span>\r\n                        </div>\r\n                        <div>\r\n                            <label>Regression:&nbsp;</label>\r\n                            <br/>\r\n                            <div class=\"btn-group\" dropdown>\r\n                                <button id=\"split-button\" type=\"button\" class=\"btn btn-default\">{{getRegressionText()}}</button>\r\n                                <button type=\"button\" class=\"btn btn-default\" dropdown-toggle>\r\n                                    <span class=\"caret\"></span>\r\n                                </button>\r\n                                <ul class=\"dropdown-menu\" role=\"menu\" aria-labelledby=\"split-button\">\r\n                                    <li role=\"menuitem\" ng-repeat=\"type in chartFactory.regressionTypes\"\r\n                                        ng-click=\"apiHandle.api.changeRegressionType(type.tag)\">\r\n                                        <a href=\"#\">{{type.text}}</a>\r\n                                    </li>\r\n                                    <li role=\"menuitem\" ng-click=\"apiHandle.api.changeRegressionType()\">\r\n                                        <a href=\"#\">None</a>\r\n                                    </li>\r\n                                </ul>\r\n                            </div>\r\n                            <div ng-show=\"chartProperties.regression == \'polynomial\'\">\r\n                                <label>Regression Degree:</label>\r\n                                <input class=\"form-control\" type=\"number\" min=\"1\" ng-model=\"chartProperties.regression_degree\"\r\n                                       ng-change=\"apiHandle.api.timeoutLoadChart()\"/>\r\n                            </div>\r\n                        </div>\r\n                        <br/>\r\n                        <div>\r\n                            <div>\r\n                                <input type=\"checkbox\" ng-model=\"chartProperties.show_datalabel\" ng-click=\"apiHandle.api.timeoutLoadChart()\"/>\r\n                                Data Labels\r\n                            </div>\r\n                            <div style=\"padding-top:10px;\">\r\n                                <input type=\"checkbox\" ng-model=\"chartProperties.outlier_remove\" ng-click=\"apiHandle.api.timeoutLoadChart()\"/>\r\n                                Remove Outliers\r\n                            </div>\r\n                        </div>\r\n                    </div>\r\n                    <div ng-if=\"chartProperties.type == \'Column Chart\'\">\r\n                        <label>Group By:&nbsp;</label>\r\n                        <div class=\"restrict-dropdown-menu input-group\">\r\n                            <input type=\"text\" class=\"form-control\"\r\n                                   ng-model=\"chartProperties.group_by\"\r\n                                   typeahead=\"column as column.text for column in getValidColumns(categoricalColumns) | filter:$viewValue:$emptyOrMatch | orderBy:\'text.toString()\'\"\r\n                                   typeahead-on-select=\"apiHandle.api.loadChart()\"\r\n                                   typeahead-focus/>\r\n                            <span class=\"dhc-clickable input-group-addon\" ng-click=\"chartProperties.group_by = undefined;apiHandle.api.loadChart()\">\r\n                                <strong>X</strong>\r\n                            </span>\r\n                        </div>\r\n                    </div>\r\n                    <div ng-if=\"chartProperties.type != \'Column Chart\' && chartProperties.type != \'Scattered Plot\'\">\r\n                        There are no other options for this type of chart\r\n                    </div>\r\n                </div>\r\n            </span>\r\n        </span>\r\n        <span class=\"flex-sub-container-right\">\r\n            <span ng-hide=\"chartOptions.disableChartType\" dhc-click-outside dhc-open-state=\"states.menuDisplays.changeChartType\"\r\n                              dhc-close-callback=\"toggleSlide(!states.menuDisplays.changeChartType,\'change-chart-type\')\">\r\n                <a class=\"clickable\" style=\"text-decoration:none;padding-right:20px;\"\r\n                   ng-click=\"toggleSlide(!states.menuDisplays.changeChartType,\'change-chart-type\');selected=\'\';\">\r\n                    <span class=\"fake-anchor-tag\">Chart type</span>\r\n                    <i class=\"fa\" ng-class=\"{\'fa-chevron-up\': states.menuDisplays.changeChartType, \'fa-chevron-down\': !states.menuDisplays.changeChartType}\"></i>\r\n                </a>\r\n                <div class=\"change-chart-type floating-form\" style=\"display: none;width:450px;right: 0px;\">\r\n                    <label>Chart Type:</label>\r\n                    <br/>\r\n                    <div class=\"btn-group\">\r\n                        <label class=\"btn btn-primary\" ng-model=\"chartProperties.type\" btn-radio=\"\'Pie Chart\'\" ng-click=\"changeChartType()\">Pie Chart</label>\r\n                        <label class=\"btn btn-primary\" ng-model=\"chartProperties.type\" btn-radio=\"\'Box Plot\'\" ng-click=\"changeChartType()\">Box Plot</label>\r\n                        <label class=\"btn btn-primary\" ng-model=\"chartProperties.type\" btn-radio=\"\'Column Chart\'\" ng-click=\"changeChartType()\">Column Chart</label>\r\n                        <label class=\"btn btn-primary\" ng-model=\"chartProperties.type\" btn-radio=\"\'Scattered Plot\'\" ng-click=\"changeChartType()\">Scattered Plot</label>\r\n                    </div>\r\n                    <br/>\r\n                    <br/>\r\n                    <label>Data to show:</label>\r\n                    <br/>\r\n                    <div class=\"btn-group\">\r\n                        <label class=\"btn btn-primary\" ng-model=\"chartProperties.dataToShow\" btn-radio=\"\'all\'\" ng-click=\"apiHandle.api.timeoutLoadChart()\">All Data</label>\r\n                        <label class=\"btn btn-primary\" ng-model=\"chartProperties.dataToShow\" btn-radio=\"\'selected\'\" ng-click=\"apiHandle.api.timeoutLoadChart()\">Selected Data</label>\r\n                    </div>\r\n                </div>\r\n            </span>\r\n            <span ng-hide=\"chartOptions.disableExporting\">\r\n                <span class=\"clickable\" style=\"padding-right:5px;color:#005da0;\" ng-click=\"exportXLS()\" title=\"Excel\"><i class=\"fa fa-file-excel-o\"></i></span>\r\n                <span class=\"clickable\" style=\"padding-right:5px;color:#005da0;\" ng-click=\"exportPDF()\" title=\"PDF\"><i class=\"fa fa-file-pdf-o\"></i></span>\r\n            </span>\r\n            <span class=\"clickable\" style=\"padding-right:5px;color:#005da0;\" ng-repeat=\"customButton in customButtons\" ng-click=\"customButton.callback()\">\r\n                <i class=\"fa\" ng-class=\"customButton.faClass\"></i>\r\n            </span>\r\n        </span>\r\n    </div>\r\n    <hr ng-hide=\"allPanelHidden()\"/>\r\n    <div class=\"chart-area-container\">\r\n        <i ng-show=\"isProcessing\" class=\"fa fa-spinner fa-spin fa-3x spinner\" style=\"position:absolute;top:0;left:0\"></i>\r\n        <!-- this is where the stock chart goes -->\r\n        <div style=\"position:relative;height:100%\">\r\n            <alert ng-show=\"states.needAttrs\" close=\"states.needAttrs = false\" type=\"warning\" style=\"font-size: 12px;position: absolute;z-index:999\">\r\n                Please enter required attributes\r\n            </alert>\r\n            <div class=\"dhc-chart-toolbar\" ng-show=\"apiHandle.api.excludedPoints.length > 0\">\r\n                <a class=\"clickable\" ng-click=\"apiHandle.api.resetExcludedPoints()\">\r\n                    Reset Points <i class=\"fa fa-refresh\"></i>\r\n                </a>\r\n            </div>\r\n            <div ng-attr-id=\"{{chartId}}\" style=\"width:100%;height:100%;\" ng-class=\"{\'dhc-opaque\': states.needAttrs}\">\r\n            </div>\r\n        </div>\r\n        <alert ng-show=\"alerts.generalWarning.active\" style=\"position:absolute;bottom:0;right:0;\"\r\n               close=\"alerts.generalWarning.active = false\" type=\"danger\">\r\n            {{alerts.generalWarning.message}}\r\n        </alert>\r\n    </div>\r\n</div>");}]);