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
                    chartRendering: "&?",
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
                    title: "@?",
                    /**
                     * Additional HighCharts options to layer on defaults
                     */
                    highchartOptions: "=?"
                },
                controller: function($scope, $element){
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
                        needAttrs: false
                    };

                    // disable default right-click triggered context menu
                    //elem.bind('contextmenu', function () {
                    //    return false;
                    //});

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

                    scope.getRegressionText = function(){
                        return scope.chartProperties.regression ?
                            _.findWhere(chartFactory.regressionTypes, {tag: scope.chartProperties.regression}).text :
                            "No Regression";
                    };

                    scope.getValidColumns = function(columnSet){
                        return _.filter(columnSet, function(column){
                            return getVisualizationTypes(column).indexOf(scope.chartProperties.type.toUpperCase()) > -1;
                        });
                    };

                    /**
                     * turn each series's data into a HTML table
                     * and then export this table to Excel
                     */
                    scope.exportXLS = function () {
                        var html = dhc.seriesToHTML(scope.states.chart.series);
                        if (window.navigator.msSaveBlob)
                            window.navigator.msSaveBlob(new Blob([html]), "time-series-export.xls");
                        else
                            window.open('data:application/vnd.ms-excel,' + encodeURIComponent(html));
                    };

                    scope.exportPDF = function(){
                        scope.states.chart.exportChart({
                            type: 'application/pdf',
                            filename: 'chart-export ' + scope.states.chart.title.textStr
                        });
                    };

                    scope.apiHandle.api = {
                        excludedPoints: [],
                        loadChart: function(){
                            // Tell user to fill in missing properties
                            if( _.map(chartFactory.getRequiredProperties(scope.chartProperties), function(prop){
                                    return scope.chartProperties[prop]
                                }).indexOf(undefined) > -1 ) {
                                scope.states.needAttrs = true;
                                return;
                            }
                            scope.chartRendering();
                            scope.states.needAttrs = false;
                            var opts = chartFactory.getHighchartOptions(scope, this.excludedPoints);
                            opts.chart.renderTo = scope.chartId;
                            scope.states.chart = new Highcharts.Chart(opts);
                        },
                        timeoutLoadChart: function(){
                            $timeout(function(){
                                scope.apiHandle.api.loadChart();
                            });
                        },
                        togglePoint: function(key){
                            const point = scope.states.chart.get(key);
                            if( point )
                                point.select(null, true);
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
                            this.timeoutLoadChart();
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
