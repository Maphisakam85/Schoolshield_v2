/* Persistent private attachments. No object URLs or signed URLs are stored. */
(function () {
  const categories = { visitor:'visitor-documents', incident:'incident-evidence', 'sick-notice':'sick-notices' };
  const types = { pdf:'application/pdf', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', doc:'application/msword', docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  function validate(file) {
    const extension = String(file.name || '').split('.').pop().toLowerCase();
    if (!types[extension] || !file.size || file.size > 10485760) throw new Error('Choose a PDF, Word document, PNG or JPEG image up to 10 MB.');
    return { extension, contentType:types[extension] };
  }
  function session() {
    const current = JSON.parse(sessionStorage.getItem('schoolshieldSession') || '{}');
    if (!window.schoolshieldSupabase || !current.userId || !current.schoolId) throw new Error('Sign in before uploading or retrieving documents.');
    return current;
  }
  async function upload(entity, recordId, file, retry = {}) {
    const info = validate(file), current = session(), client = window.schoolshieldSupabase;
    const id = retry.id || (retry.id = crypto.randomUUID());
    const storagePath = `${current.schoolId}/${categories[entity]}/${recordId}/${id}.${info.extension}`;
    if (!categories[entity] || !/^[A-Za-z0-9-]+$/.test(recordId)) throw new Error('The document is not linked to a valid record.');
    const row = { id, school_id:current.schoolId, entity_type:entity, record_id:recordId, category:categories[entity], storage_path:storagePath, filename:file.name, content_type:info.contentType, size_bytes:file.size, submitted_by:current.userId };
    if (!retry.staged) {
      const { error } = await client.from('document_attachments').insert(row);
      if (error) {
        if (error.code !== '23505') throw new Error('Could not save attachment metadata: ' + error.message);
        const existing = await client.from('document_attachments').select('id,storage_path,submitted_by').eq('id',id).single();
        if (existing.error || existing.data?.storage_path !== storagePath || existing.data?.submitted_by !== current.userId) throw new Error('Attachment metadata could not be confirmed. Refresh and try again.');
      }
      retry.staged = true;
    }
    if (!retry.uploaded) {
      const { error } = await client.storage.from('school-documents').upload(storagePath,file,{ contentType:info.contentType, upsert:false });
      // A lost response may leave a completed object. Finalization verifies its
      // existence and ownership; it does not trust the browser's upload claim.
      if (error && !['409','Duplicate'].includes(String(error.statusCode || error.error))) throw new Error('Upload failed: ' + error.message);
      retry.uploaded = true;
    }
    const { error } = await client.rpc('complete_document_attachment',{p_id:id});
    if (error) throw new Error('Could not complete attachment upload: ' + error.message);
    return row;
  }
  async function list(entity, recordId) {
    const current = session();
    const { data,error } = await window.schoolshieldSupabase.from('document_attachments').select('id,filename,storage_path,content_type,size_bytes').eq('school_id',current.schoolId).eq('entity_type',entity).eq('record_id',recordId).eq('status','ready').order('created_at');
    if (error) throw new Error('Documents could not be loaded: ' + error.message);
    if (entity !== 'sick-notice') return data || [];
    const legacy = await window.schoolshieldSupabase.from('sick_notice_attachments').select('id,storage_path').eq('school_id',current.schoolId).eq('sick_notice_id',recordId);
    if (legacy.error) throw new Error('Existing sick-notice documents could not be loaded: ' + legacy.error.message);
    return [...(data || []), ...(legacy.data || []).map(row => ({ ...row,id:'legacy:' + row.id,filename:row.storage_path.split('/').pop() }))];
  }
  async function download(id) {
    session(); const client = window.schoolshieldSupabase;
    const legacy = id.startsWith('legacy:');
    let query = client.from(legacy ? 'sick_notice_attachments' : 'document_attachments').select(legacy ? 'storage_path' : 'filename,storage_path').eq('id',legacy ? id.slice(7) : id);
    if (!legacy) query = query.eq('status','ready');
    const { data:row,error } = await query.single();
    if (error || !row) throw new Error('This document is unavailable or you do not have permission to open it.');
    const result = await client.storage.from('school-documents').createSignedUrl(row.storage_path,60,{download:row.filename || row.storage_path.split('/').pop()});
    if (result.error || !result.data?.signedUrl) throw new Error('The document could not be retrieved. Check your connection and access permissions.');
    return result.data.signedUrl;
  }
  window.SchoolShieldDocuments = { validate,upload,list,download };
})();
