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
                            saveAs(new Blob([html],'time-series-export.xls'));
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
