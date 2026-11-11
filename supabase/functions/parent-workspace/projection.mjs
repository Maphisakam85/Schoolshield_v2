const pick=(record,keys)=>Object.fromEntries(keys.filter(key=>Object.hasOwn(record,key)).map(key=>[key,record[key]]));
export function parentPayload(raw, learnerIds, parentId) {
  const learners = (raw.learners || []).filter(learner => learnerIds.has(learner.id));
  const classIds = new Set(learners.map(learner => learner.class));
  const classSummary = classId => {
    const rows=(raw.learners||[]).filter(learner=>learner.class===classId);
    const average=key=>{const values=rows.map(row=>row[key]).filter(Number.isFinite);return values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length):0;};
    const passing=rows.filter(row=>Number.isFinite(row.average)&&row.average>=50).length;
    return {learners:rows.length,attendance:average('attendance'),courseAverage:average('average'),passing,passRate:rows.length?Math.round(100*passing/rows.length):0};
  };
  const familyAnnouncement = announcement => {
    const audience = announcement.audienceId;
    if (!audience) return /parent|family|whole.school/i.test(String(announcement.audience || ""));
    if (["whole-school", "all-parents"].includes(audience)) return true;
    if (audience === "my-classes-parents") return (announcement.classIds || []).some(id => classIds.has(id));
    if (audience.startsWith("class-")) return classIds.has(audience.slice(6));
    if (audience.startsWith("grade-")) return learners.some(learner => String(learner.grade).replace(/\s+/g, "-") === audience.slice(6));
    return false;
  };
  const onlyLearnerScores = (scores = {}) => Object.fromEntries(
    Object.entries(scores).filter(([id]) => learnerIds.has(id)),
  );
  const reports = (raw.reports || []).filter(report => classIds.has(report.class)).map(report => ({
    ...pick(report, ['id','entityId','school_id','class','term','academic_year','status','compiledOn','finalisedOn','publishedOn']),
    releasedLearners: Object.fromEntries(Object.entries(report.releasedLearners || {}).filter(([id]) => learnerIds.has(id))),
  }));

  return {
    __v: raw.__v || 13,
    subjects: raw.subjects || [],
    grades: raw.grades || [],
    classes: (raw.classes || []).filter(schoolClass => classIds.has(schoolClass.id)).map(schoolClass=>({...schoolClass,learningSummary:classSummary(schoolClass.id)})),
    learners,
    assessments: (raw.assessments || []).filter(assessment => classIds.has(assessment.class)).map(assessment => ({ ...pick(assessment, ['id','entityId','school_id','class','subject','title','type','date','term','academic_year','weighting','status']), scores: onlyLearnerScores(assessment.scores) })),
    reports,
    announcements: (raw.announcements || []).filter(familyAnnouncement),
    visitors: [], incidents: [], staff: [], staffChangeRequests: [], security: [], appointments: [], teacherChat: [],
    notifications: (raw.notifications || []).filter(notice => {
      if (notice.incidentId || (notice.recipientId && notice.recipientId !== parentId) || (notice.recipient && notice.recipientId !== parentId)) return false;
      if (notice.announcementId) return familyAnnouncement(notice);
      if (notice.recipientId === parentId) return true;
      if (notice.learnerId && !learnerIds.has(notice.learnerId) || notice.class && !classIds.has(notice.class)) return false;
      return notice.scope === 'whole-school' || ['parents','parent','learner','system'].includes(notice.scope) && (learnerIds.has(notice.learnerId) || classIds.has(notice.class) || ['parents','parent'].includes(notice.scope));
    }),
    sickNotices: (raw.sickNotices || []).filter(notice => learnerIds.has(notice.learnerId) && notice.submittedById === parentId),
    parentChat: (raw.parentChat || []).filter(conversation => learnerIds.has(conversation.learnerId)),
    attendanceRegisters: (raw.attendanceRegisters || []).filter(register => classIds.has(register.class)).map(register => ({ ...pick(register, ['id','class','date','teacher','capturedOn']), entries: onlyLearnerScores(register.entries) })),
    attendanceWeeks: (raw.attendanceWeeks || []).filter(week => classIds.has(week.class)).map(week => pick(week, ['id','class','week','weekStart','status','submittedOn'])),
    chatExtras: [], reportRequests: [], teacherAssignments: [],
  };
}
