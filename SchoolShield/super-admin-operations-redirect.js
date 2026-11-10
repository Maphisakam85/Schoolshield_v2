(() => { const query=new URLSearchParams(location.search);location.replace((query.has('ticket')?'super-admin-support.html':'super-admin-access.html')+location.search); })();
