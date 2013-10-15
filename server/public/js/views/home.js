// The main screen of our app.
// 
// Our model is the settings object.

window.HomeView = Backbone.View.extend({

    initialize:function (options) {
        this.manager = this.options.im;
        this.settings = this.model;
        this.linkManager = this.options.lm;
        this.linkManager.on('status', this.updatestatus, this); 
        this.linkManager.on('uniqueID', this.updateUID, this);
        
        // Keep a reference to our instrument views to close
        // them properly when we close
        this.instrumentLiveView = null;
        this.instrumentNumericView = null;
        
        // We manage the instrument UniqueID and storage of its
        // properties in the home view (this is common across all
        // instrument types in the application)
        this.instrumentUniqueID = null;
        
        this.instrument = null;
        this.recording = false;
        this.currentLogSession = null;
        
    },
    
    events: {
        "click .ctrl-connect":  "ctrlConnect",
        "click .ctrl-record": "ctrlRecord",
        "click .start-record": "startRecord",

    },
    
    render:function () {
        var self = this;
        console.log('Main render of Home view');
        $(this.el).html(this.template(this.model.toJSON()));
        
        // If we have a selected instrument, then instanciate its liveview here
        if (this.settings.get('currentInstrument') != null) {
            console.log('Create the instrument live view');
            this.instrument = new Instrument({_id: this.settings.get('currentInstrument')});
            this.instrument.fetch({success: function(){
                // We have the instrument, get the correct view for it:
                var type = self.instrument.get('type');
                console.log('Ins type: ' + type );
                self.instrumentLiveView = self.manager.getInstrumentType(type).getLiveDisplay({model: self.instrument, lm: self.linkManager});
                $('#liveview').html(self.instrumentLiveView.el);
                self.instrumentLiveView.render();
                
                // Now start the numeric display (the one on the right)
                self.instrumentNumericView = self.manager.getInstrumentType(type).getNumDisplay({model: self.settings, lm: self.linkManager});
                if (self.instrumentNumericView != null) {
                    $('#numview').html(self.instrumentNumericView.el);
                    self.instrumentNumericView.render();
                }
                
                // Enable the "Connect" button now that we are ready
                $('.ctrl-connect', this.el).removeAttr('disabled');

            }});
        }
        
        this.linkManager.requestStatus();
        
        return this;
    },
        
    onClose: function() {
        console.log("Home view closing...");
        
        this.linkManager.off('status', this.updatestatus, this);
        this.linkManager.off('uniqueID', this.updateUID, this);
        this.linkManager.off('serialEvent', this.recordStream, this);

        
        if (typeof(this.instrumentLiveView) != undefined)
            this.instrumentLiveView.onClose();
        
        if (typeof(this.instrumentNumericView) != undefined)
            this.instrumentNumericView.onClose();

        // Restore the settings since we don't want them to be saved when changed from
        // the home screen
        this.model.fetch();
    },
        
    updateUID: function(uid) {
        console.log('Received a uniqueID for this instrument: ' + uid);
        var savedUID = this.instrument.get('uuid');
        console.log('Our instrument type is ' + this.instrument.get('type'));
        if (savedUID == "") {
            this.instrument.set('uuid',uid);
            this.instrument.save();
        } else
        if (savedUID != uid) {
            alert("Oops, this is a new instrument of the same model, please create another entry in the instruments screen");
        }
        // Now, we are sure our instrument is linked to a UID, so we are able to save logs
        // in our backend database, that are uniquely linked to this instrument.
    },

    updatestatus: function(data) {
        // Depending on port status, update our controller
        // connect button:
        if (this.linkManager.connected) {
            $('.ctrl-connect', this.el).html("<i class=\"icon-off icon-white\"></i>&nbsp;Disconnect " + this.instrument.get('name'))
                .removeClass('btn-danger').addClass('btn-success').removeClass('btn-warning').removeAttr('disabled');
            $('.btn-enable-connected', this.el).removeAttr('disabled');
            
            if (this.instrumentUniqueID == null) {
                this.linkManager.getUniqueID();
            }
        } else {
            $('.ctrl-connect', this.el).html("<i class=\"icon-off icon-white\"></i>&nbsp;Connect to " + this.instrument.get('name'))
                .addClass('btn-danger').removeClass('btn-success').removeClass('btn-warning').removeAttr('disabled');
            $('.btn-enable-connected', this.el).attr('disabled', true);

        }
    },


    ctrlConnect: function(event) {
        var self = this;
        if ($('.ctrl-connect', this.el).attr('disabled'))
            return;
        $('.ctrl-connect', this.el).html("<i class=\"icon-off icon-white\"></i>&nbsp;Connecting...").addClass('btn-warning')
                                   .removeClass('btn-success').removeClass('btn-danger').attr('disabled', true);
        // First, get serial port settings (assume Serial for now)
        var port = this.model.get('serialPort');
        console.log('Opening serial on port ' + port);
        if (port != null ) {
                if (!self.linkManager.connected) {
                    self.instrumentUniqueID = null; // Just in case we change the instrrument
                    self.linkManager.openPort(port);
                } else {
                    self.linkManager.closePort(port);
                }
        }
    },

    ctrlRecord: function() {
        var self = this;
        if ($('.ctrl-record', this.el).attr('disabled')){
                return;
        }
        if (!this.recording) {
            $('#RecordModal').modal();
        } else {
            $('.ctrl-record', this.el).html('<i class="icon-download"></i>&nbsp;Record session').addClass('btn-danger')
                       .removeClass('btn-success');
            this.linkManager.off('input', this.recordStream, this);
            this.currentLogSession.set('endstamp', new Date().getTime());
            this.currentLogSession.save({
                success: function() {
                    // TODO: show modal telling us session is recorded
                }
            });

            this.recording = false;
        }        
    },
    
    startRecord: function() {
        var self = this;
        $('#RecordModal').modal('hide');
        
        // Validate entries

        // Retrieve the log sessions
        var myLogSessions = new LogSessions([], {instrumentid: this.instrument.id});
        myLogSessions.fetch({
            success: function() {
                self.currentLogSession = new LogSession();
                self.currentLogSession.set('name', $('#recordingname',this.el).val());
                self.currentLogSession.set('startstamp', new Date().getTime());
                self.currentLogSession.set('logtype', 'live');
                // No need to set instrument ID, it is updated when creating the
                // log session
                myLogSessions.add(self.currentLogSession);
                self.currentLogSession.save();
            }
        });
        
/*
// Create the logging session, get its ID
        var sessionID = 0;

        // Phase Ib: ask the user to input additional data on the log session
        // and update the session stats (timestamp etc)
        currentLogSession.set('guid', this.currentDevice.get('guid'));
        currentLogSession.set('startstamp', new Date(points[0].time).getTime());
        currentLogSession.set('stopstamp', new Date(points[points.length-1].time).getTime());                                      
        currentLogSession.save();
        // Now se have an ID:
        var sessionID = currentLogSession.id;
*/                
        
        /**             *******   ******** *******                 **/
        
        $('.ctrl-record', this.el).html("<i class=\"icon-white icon-pause\"></i>&nbsp;Recording...").addClass('btn-success')
                   .removeClass('btn-danger').attr('disabled', false);
        this.recording = true;
        this.linkManager.on('input', this.recordStream, this);
    },
    
    
    // Note: this is _very_ inefficient, since we are sending data to the HTML app and then
    // back to the recorder!
    // TODO: refactor the whole thing, so have data stored directly on the backend with no network
    //       activity.
    recordStream: function(data) {
        //console.log("Would record the stream here...");
        
    },

});