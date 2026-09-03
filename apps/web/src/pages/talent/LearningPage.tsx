import { useState, useEffect } from 'react';
import { talentApi } from '../../api/talent';
import { BookOpen, Award } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  ENROLLED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-green-100 text-green-700',
  DROPPED: 'bg-gray-100 text-gray-500',
};

export default function LearningPage() {
  const [tab, setTab] = useState<'catalog' | 'enrollments'>('catalog');
  const [courses, setCourses] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState<string | null>(null);

  const loadCourses = async () => {
    try {
      const r = await talentApi.getCourses({ limit: 50 });
      setCourses(r.data?.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadCourses(); }, []);

  const handleEnroll = async (courseId: string) => {
    setEnrolling(courseId);
    try {
      await talentApi.enroll({ courseId, employeeId: 'current' });
      alert('Enrolled successfully!');
    } catch (err: any) {
      alert(err.response?.data?.message || 'Enrollment failed');
    } finally {
      setEnrolling(null);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Learning & Development</h1>
        <p className="text-sm text-gray-500 mt-1">Browse courses and track learning progress</p>
      </div>

      <div className="flex gap-1 mb-6 border-b">
        {(['catalog', 'enrollments'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t === 'catalog' ? 'Course Catalog' : 'My Enrollments'}
          </button>
        ))}
      </div>

      {tab === 'catalog' && (
        <div>
          {loading ? <div className="text-center text-gray-500 py-8">Loading...</div> : courses.length === 0 ? (
            <div className="text-center text-gray-500 py-12">
              <BookOpen className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>No courses available yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {courses.map(course => (
                <div key={course.id} className="bg-white border rounded-xl p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="h-10 w-10 bg-blue-50 rounded-lg flex items-center justify-center">
                      <BookOpen className="h-5 w-5 text-blue-600" />
                    </div>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{course.type}</span>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">{course.title}</h3>
                  <p className="text-xs text-gray-500 mb-2">{course.code}</p>
                  {course.description && <p className="text-sm text-gray-600 mb-3 line-clamp-2">{course.description}</p>}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">{course.durationHours}h</span>
                    <button onClick={() => handleEnroll(course.id)} disabled={enrolling === course.id} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                      {enrolling === course.id ? 'Enrolling...' : 'Enroll'}
                    </button>
                  </div>
                  {course.skillTags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {course.skillTags.map((tag: string) => (
                        <span key={tag} className="text-xs bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'enrollments' && (
        <div>
          {enrollments.length === 0 ? (
            <div className="text-center text-gray-500 py-12">
              <Award className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>No enrollments yet. Browse the catalog to enroll in courses.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {enrollments.map(e => (
                <div key={e.id} className="bg-white border rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">{e.courseId}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[e.status]}`}>{e.status}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Enrolled: {new Date(e.enrolledAt).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
